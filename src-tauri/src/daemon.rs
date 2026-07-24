//! Daemon discovery & launch.
//!
//! 复用 kimi-ui 的 connect_daemon / kimi_home / find_kimi / home_dir 逻辑。
//! 职责:确保本地 kimi daemon 在跑,拿到 host/port/token,组装 base URL。
//! 这层不依赖 Tauri,纯 Rust,方便测试和后续抽出。
//!
//! 版本适配:
//! - 0.27 及更早:`kimi server run` + 读 `~/.kimi-code/server/lock`
//! - 0.28+:`kimi web`(foreground)+ 读 `~/.kimi-code/server/instances/*.json`(多实例)
//! connect_daemon 同时支持两种,优先新格式。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// 已发现的 daemon 连接信息。
#[derive(Debug, Clone, Serialize)]
pub struct Launch {
    /// `http://127.0.0.1:58627`(不含 query)
    pub base: String,
    /// daemon bearer token,前端 WS/REST 用 `Authorization: Bearer <token>`
    pub token: String,
}

fn home_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
}

/// `KIMI_CODE_HOME` 优先,否则 `~/.kimi-code`。
pub fn kimi_home() -> PathBuf {
    std::env::var("KIMI_CODE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_dir().join(".kimi-code"))
}

/// Locate the `kimi` binary. GUI apps launched from Finder get a minimal PATH,
/// so fall back to well-known install locations.
/// Windows:npm 全局安装的可执行文件是 `kimi.cmd`(不是 .exe),必须一并尝试;
/// Rust ≥1.77 会自动用 cmd.exe 包裹 .cmd/.bat,直接 spawn 即可。
pub fn find_kimi() -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) {
        &["kimi.exe", "kimi.cmd", "kimi.bat", "kimi"]
    } else {
        &["kimi"]
    };
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in names {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        candidates.push(home_dir().join(".kimi-code/bin/kimi.exe"));
        // npm 全局前缀(%APPDATA%\npm)下的 shim
        if let Ok(appdata) = std::env::var("APPDATA") {
            for name in ["kimi.cmd", "kimi.exe"] {
                candidates.push(PathBuf::from(&appdata).join("npm").join(name));
            }
        }
    } else {
        candidates.push(home_dir().join(".kimi-code/bin/kimi"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/kimi"));
        candidates.push(PathBuf::from("/usr/local/bin/kimi"));
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// 新格式实例信息(0.28+:`server/instances/<ULID>.json`)
#[derive(Deserialize)]
struct InstanceInfo {
    #[allow(dead_code)]
    server_id: String,
    #[allow(dead_code)]
    pid: u64,
    host: String,
    port: u64,
    #[allow(dead_code)]
    started_at: f64,
    #[allow(dead_code)]
    heartbeat_at: f64,
    #[allow(dead_code)]
    host_version: String,
}

/// 旧格式 lock(0.27-:`server/lock`)
#[derive(Deserialize)]
struct LegacyLock {
    host: Option<String>,
    port: Option<u64>,
}

/// 尝试从 `server/instances/` 目录找到最新活着的实例。
fn find_instance_from_instances_dir(home: &PathBuf) -> Option<(String, u64)> {
    let instances_dir = home.join("server/instances");
    let entries = fs::read_dir(&instances_dir).ok()?;
    let mut latest: Option<(f64, String, u64)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path).ok()?;
        let info: InstanceInfo = match serde_json::from_str(&content) {
            Ok(i) => i,
            Err(_) => continue,
        };
        // 选 heartbeat 最新的
        match &latest {
            Some((hb, _, _)) if *hb >= info.heartbeat_at => {}
            _ => {
                latest = Some((info.heartbeat_at, info.host, info.port));
            }
        }
    }
    latest.map(|(_, h, p)| (h, p))
}

/// 尝试从旧 `server/lock` 读取。
fn find_instance_from_legacy_lock(home: &PathBuf) -> Option<(String, u64)> {
    let lock_raw = fs::read_to_string(home.join("server/lock")).ok()?;
    let lock: LegacyLock = serde_json::from_str(&lock_raw).ok()?;
    let host = lock.host.unwrap_or_else(|| "127.0.0.1".to_string());
    let port = lock.port.unwrap_or(58627);
    Some((host, port))
}

/// Ensure the local daemon is running and discover its address/credentials.
///
/// 1. 尝试 `kimi web`(0.28+,foreground)启动 server
/// 2. 如果 `kimi web` 不存在(旧版),fallback `kimi server run`
/// 3. 优先读 `server/instances/`(0.28+ 多实例),fallback `server/lock`(0.27-)
/// 4. 读 `server.token` 拿 bearer
pub fn connect_daemon() -> Result<Launch, String> {
    let kimi = find_kimi().ok_or_else(|| "找不到 kimi CLI，请先安装 Kimi Code".to_string())?;

    let home = kimi_home();

    // 先看是否已有实例在跑(不需要重复启动)
    let already_running = find_instance_from_instances_dir(&home)
        .or_else(|| find_instance_from_legacy_lock(&home));

    if already_running.is_none() {
        // 启动 daemon:`kimi web` / `kimi server run` 都是前台长驻进程,
        // 必须 spawn 不等待 + 轮询实例文件出现。
        // ⚠️ 阻塞式 .output() 会永久挂起(macOS 上因常驻实例从未走到这条路径,
        // Windows 首启必踩)。Windows 上加 CREATE_NO_WINDOW 避免弹控制台黑窗。
        let mut ok = false;
        for args in [["web"].as_slice(), ["server", "run"].as_slice()] {
            let mut cmd = Command::new(&kimi);
            cmd.args(args);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            if cmd.spawn().is_err() {
                continue;
            }
            for _ in 0..20 {
                if find_instance_from_instances_dir(&home).is_some()
                    || find_instance_from_legacy_lock(&home).is_some()
                {
                    ok = true;
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
            if ok {
                break;
            }
        }
        if !ok {
            return Err(
                "daemon 启动超时(可先手动运行 `kimi web` 验证 kimi CLI 可用后再开应用)".to_string(),
            );
        }
    }

    // 重新读取实例信息(启动后可能需要等一下)
    let (host, port) = find_instance_from_instances_dir(&home)
        .or_else(|| find_instance_from_legacy_lock(&home))
        .unwrap_or(("127.0.0.1".to_string(), 58627));

    let token = fs::read_to_string(home.join("server.token"))
        .map_err(|e| format!("读取 server.token 失败（可先运行一次 `kimi web`）：{e}"))?;
    let token = token.trim().to_string();

    let base = format!("http://{host}:{port}");
    Ok(Launch { base, token })
}
