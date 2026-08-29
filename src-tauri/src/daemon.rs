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
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAX_HEARTBEAT_AGE_SECS: f64 = 30.0;
const CONNECT_TIMEOUT: Duration = Duration::from_millis(180);
// `kimi web` opens the system browser by default. The desktop shell only needs
// its daemon, so every modern-CLI cold start must opt out explicitly. This is
// especially visible on Windows, where no daemon usually exists on first run.
const DAEMON_LAUNCH_ATTEMPTS: &[&[&str]] = &[&["web", "--no-open"], &["server", "run"]];

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

// ---------------------------------------------------------------------------
// GUI-managed daemon environment experiments (Kimi Code 0.36+/0.39+).
// Env-gated experiments (tower, remote-control): env vars take the HIGHEST
// precedence and only the GUI controls their injection, so the GUI persists
// user choices at `<kimi_home>/kimi-gui-experiments.json` and injects them
// into every daemon process it starts (auto-connect AND restart). config.toml
// `[experimental]` can also enable these flags — but that path needs a daemon
// restart and is not toggleable per-process the way env injection is.
// Takes effect on next start.
// ---------------------------------------------------------------------------

/// (config key, env var) pairs the GUI is willing to inject.
const EXPERIMENT_ENV_KEYS: &[(&str, &str)] = &[
    ("tower", "KIMI_CODE_EXPERIMENTAL_TOWER"),
    ("remote_control", "KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL"),
];

fn gui_experiments_path() -> PathBuf {
    kimi_home().join("kimi-gui-experiments.json")
}

pub fn read_gui_experiments() -> Vec<String> {
    std::fs::read_to_string(gui_experiments_path())
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.as_object().cloned())
        .map(|object| {
            object
                .iter()
                .filter(|(_, flag)| flag.as_bool() == Some(true))
                .map(|(key, _)| key.clone())
                .collect()
        })
        .unwrap_or_default()
}

pub fn save_gui_experiments(enabled: Vec<String>) -> Result<(), String> {
    let mut object = serde_json::Map::new();
    for (key, _) in EXPERIMENT_ENV_KEYS {
        let on = enabled.iter().any(|item| item == key);
        object.insert((*key).to_string(), serde_json::Value::Bool(on));
    }
    let text = serde_json::to_string_pretty(&serde_json::Value::Object(object))
        .map_err(|e| e.to_string())?;
    // `<kimi_home>` may not exist yet on a fresh install (daemon never started),
    // so create it before writing — same precedent as runtime.rs atomic_write.
    std::fs::create_dir_all(kimi_home()).map_err(|e| e.to_string())?;
    // Atomic replace: write a sibling temp file, then rename over the target so
    // a crash mid-write can never leave a truncated experiments file behind.
    let path = gui_experiments_path();
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|e| e.to_string())
}

/// Inject the GUI-managed experiment env vars into a daemon-launch command.
fn apply_daemon_env(command: &mut Command) {
    // GUI exposes a secondary-model picker for subagents. The feature remains
    // opt-in in the CLI, so enable only this documented experiment for daemon
    // processes started by Kimi GUI — always on, not user-toggleable.
    command.env("KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL", "1");
    let enabled = read_gui_experiments();
    for (key, env_name) in EXPERIMENT_ENV_KEYS {
        if enabled.iter().any(|item| item == key) {
            command.env(env_name, "1");
        }
    }
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
#[derive(Clone, Deserialize)]
struct InstanceInfo {
    #[allow(dead_code)]
    server_id: String,
    #[allow(dead_code)]
    pid: u64,
    host: String,
    port: u64,
    #[allow(dead_code)]
    started_at: f64,
    heartbeat_at: f64,
    #[allow(dead_code)]
    host_version: String,
}

fn local_endpoint_from_base(base: &str) -> Result<(String, u16), String> {
    let authority = base
        .strip_prefix("http://")
        .ok_or("只能重启本机 HTTP daemon")?;
    if authority.contains('/') || authority.contains('?') || authority.contains('#') {
        return Err("daemon 地址格式无效".to_string());
    }
    let (raw_host, raw_port) = authority.rsplit_once(':').ok_or("daemon 地址缺少端口")?;
    let host = raw_host.trim_matches(['[', ']']);
    if !matches!(host, "127.0.0.1" | "localhost" | "::1") {
        return Err("只允许从 GUI 重启本机 daemon".to_string());
    }
    let port = raw_port
        .parse::<u16>()
        .map_err(|_| "daemon 端口无效".to_string())?;
    Ok((host.to_string(), port))
}

fn latest_instance_for_endpoint(home: &PathBuf, host: &str, port: u16) -> Option<InstanceInfo> {
    let entries = fs::read_dir(home.join("server/instances")).ok()?;
    entries
        .flatten()
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|content| serde_json::from_str::<InstanceInfo>(&content).ok())
        .filter(|info| info.host == host && info.port == u64::from(port))
        .max_by(|left, right| {
            left.heartbeat_at
                .partial_cmp(&right.heartbeat_at)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
}

fn request_local_shutdown(host: &str, port: u16, token: &str) -> Result<(), String> {
    if token.bytes().any(|byte| matches!(byte, b'\r' | b'\n')) {
        return Err("daemon token 格式无效".to_string());
    }
    let address = (host, port)
        .to_socket_addrs()
        .map_err(|e| format!("解析 daemon 地址失败: {e}"))?
        .next()
        .ok_or("找不到 daemon 地址")?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|e| format!("连接 daemon 失败: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let request = format!(
        "POST /api/v1/shutdown HTTP/1.1\r\nHost: {host}:{port}\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("请求 daemon 关闭失败: {e}"))?;
    let mut response = Vec::new();
    let _ = stream.read_to_end(&mut response);
    let status = String::from_utf8_lossy(&response);
    if status.starts_with("HTTP/1.1 200") || status.starts_with("HTTP/1.0 200") {
        Ok(())
    } else {
        Err("daemon 拒绝了关闭请求；运行中的任务未被中断".to_string())
    }
}

/// Gracefully stop the exact loopback daemon currently used by the GUI, then
/// launch the installed CLI on the same address. Other Kimi daemon instances
/// are deliberately left untouched.
pub fn restart_daemon(current: &Launch) -> Result<Launch, String> {
    let (host, port) = local_endpoint_from_base(&current.base)?;
    let home = kimi_home();
    let old_instance = latest_instance_for_endpoint(&home, &host, port)
        .ok_or("找不到当前 daemon 的实例记录，为避免误停进程已取消重启")?;

    request_local_shutdown(&host, port, &current.token)?;
    let stop_deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < stop_deadline && endpoint_is_reachable(&host, u64::from(port)) {
        std::thread::sleep(Duration::from_millis(150));
    }
    if endpoint_is_reachable(&host, u64::from(port)) {
        return Err("daemon 未在 8 秒内退出；未启动第二个实例".to_string());
    }

    let kimi = find_kimi().ok_or("找不到 kimi CLI，请先安装或更新 Kimi Code")?;
    let mut command = Command::new(kimi);
    let port_text = port.to_string();
    command.args([
        "web",
        "--host",
        host.as_str(),
        "--port",
        port_text.as_str(),
        "--no-open",
    ]);
    apply_daemon_env(&mut command);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("启动新版 daemon 失败: {e}"))?;

    let start_deadline = Instant::now() + Duration::from_secs(12);
    while Instant::now() < start_deadline {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!("新版 daemon 启动失败: {status}"));
        }
        if endpoint_is_reachable(&host, u64::from(port)) {
            if let Some(instance) = latest_instance_for_endpoint(&home, &host, port) {
                if instance.pid != old_instance.pid {
                    let token = fs::read_to_string(home.join("server.token"))
                        .map_err(|e| format!("读取 server.token 失败: {e}"))?
                        .trim()
                        .to_string();
                    return Ok(Launch {
                        base: current.base.clone(),
                        token,
                    });
                }
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    let _ = child.kill();
    let _ = child.wait();
    Err("新版 daemon 启动超时，已停止未就绪的进程".to_string())
}

fn heartbeat_is_fresh(heartbeat_at: f64, now_secs: f64) -> bool {
    if !heartbeat_at.is_finite() || heartbeat_at <= 0.0 {
        return false;
    }
    // Some historical builds wrote milliseconds while current builds write seconds.
    let normalized = if heartbeat_at > 10_000_000_000.0 {
        heartbeat_at / 1000.0
    } else {
        heartbeat_at
    };
    let age = now_secs - normalized;
    (-5.0..=MAX_HEARTBEAT_AGE_SECS).contains(&age)
}

fn endpoint_is_reachable(host: &str, port: u64) -> bool {
    let Ok(port) = u16::try_from(port) else {
        return false;
    };
    let Ok(addresses) = (host, port).to_socket_addrs() else {
        return false;
    };
    addresses
        .into_iter()
        .any(|address| TcpStream::connect_timeout(&address, CONNECT_TIMEOUT).is_ok())
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
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs_f64();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let info: InstanceInfo = match serde_json::from_str(&content) {
            Ok(i) => i,
            Err(_) => continue,
        };
        if !heartbeat_is_fresh(info.heartbeat_at, now_secs)
            || !endpoint_is_reachable(&info.host, info.port)
        {
            continue;
        }
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
    endpoint_is_reachable(&host, port).then_some((host, port))
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
    let already_running =
        find_instance_from_instances_dir(&home).or_else(|| find_instance_from_legacy_lock(&home));

    if already_running.is_none() {
        // 启动 daemon:`kimi web` / `kimi server run` 都是前台长驻进程,
        // 必须 spawn 不等待 + 轮询实例文件出现。
        // ⚠️ 阻塞式 .output() 会永久挂起(macOS 上因常驻实例从未走到这条路径,
        // Windows 首启必踩)。Windows 上加 CREATE_NO_WINDOW 避免弹控制台黑窗。
        let mut ok = false;
        for args in DAEMON_LAUNCH_ATTEMPTS {
            let mut cmd = Command::new(&kimi);
            cmd.args(*args);
            apply_daemon_env(&mut cmd);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            let mut child = match cmd.spawn() {
                Ok(c) => c,
                Err(_) => continue,
            };
            for _ in 0..20 {
                // 子进程已退出(如旧版 CLI 不认识 `web` 子命令)就立即换下一组,
                // 不要傻等满 10s。
                if child.try_wait().map(|st| st.is_some()).unwrap_or(false) {
                    break;
                }
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
            // 本组启动超时且子进程还活着:杀掉再试下一组,避免残留多个 daemon。
            let _ = child.kill();
            let _ = child.wait();
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

#[cfg(test)]
mod tests {
    use super::{heartbeat_is_fresh, local_endpoint_from_base, DAEMON_LAUNCH_ATTEMPTS};

    #[test]
    fn desktop_daemon_start_never_opens_the_web_ui() {
        assert_eq!(DAEMON_LAUNCH_ATTEMPTS[0], ["web", "--no-open"]);
        assert_eq!(DAEMON_LAUNCH_ATTEMPTS[1], ["server", "run"]);
    }

    #[test]
    fn accepts_recent_seconds_and_milliseconds() {
        let now = 1_800_000_000.0;
        assert!(heartbeat_is_fresh(now - 5.0, now));
        assert!(heartbeat_is_fresh((now - 5.0) * 1000.0, now));
    }

    #[test]
    fn rejects_stale_invalid_and_far_future_heartbeats() {
        let now = 1_800_000_000.0;
        assert!(!heartbeat_is_fresh(now - 31.0, now));
        assert!(!heartbeat_is_fresh(f64::NAN, now));
        assert!(!heartbeat_is_fresh(now + 10.0, now));
    }

    #[test]
    fn restart_target_must_be_an_explicit_loopback_endpoint() {
        assert_eq!(
            local_endpoint_from_base("http://127.0.0.1:58627").unwrap(),
            ("127.0.0.1".to_string(), 58627)
        );
        assert_eq!(
            local_endpoint_from_base("http://[::1]:58627").unwrap(),
            ("::1".to_string(), 58627)
        );
        assert!(local_endpoint_from_base("https://127.0.0.1:58627").is_err());
        assert!(local_endpoint_from_base("http://192.168.1.9:58627").is_err());
        assert!(local_endpoint_from_base("http://127.0.0.1:58627/path").is_err());
    }
}
