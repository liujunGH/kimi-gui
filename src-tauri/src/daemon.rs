//! Daemon discovery & launch.
//!
//! 复用 kimi-ui 的 connect_daemon / kimi_home / find_kimi / home_dir 逻辑。
//! 职责:确保本地 kimi daemon 在跑,拿到 host/port/token,组装 base URL。
//! 这层不依赖 Tauri,纯 Rust,方便测试和后续抽出。

use serde::Serialize;
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
pub fn find_kimi() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join("kimi");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    let candidates = [
        home_dir().join(".kimi-code/bin/kimi"),
        PathBuf::from("/opt/homebrew/bin/kimi"),
        PathBuf::from("/usr/local/bin/kimi"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

/// Ensure the local daemon is running and discover its address/credentials.
///
/// 1. 调 `kimi server run`(daemon 自启动,幂等)
/// 2. 读 `~/.kimi-code/server/lock` 拿 host/port
/// 3. 读 `~/.kimi-code/server.token` 拿 bearer
pub fn connect_daemon() -> Result<Launch, String> {
    let kimi = find_kimi().ok_or_else(|| "找不到 kimi CLI，请先安装 Kimi Code".to_string())?;
    let output = Command::new(kimi)
        .args(["server", "run"])
        .output()
        .map_err(|e| format!("执行 `kimi server run` 失败：{e}"))?;
    if !output.status.success() {
        return Err(format!(
            "`kimi server run` 退出码非零：{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let home = kimi_home();
    let lock_raw = fs::read_to_string(home.join("server/lock"))
        .map_err(|e| format!("读取 server/lock 失败：{e}"))?;
    let lock: serde_json::Value =
        serde_json::from_str(&lock_raw).map_err(|e| format!("解析 server/lock 失败：{e}"))?;
    let host = lock["host"].as_str().unwrap_or("127.0.0.1");
    let port = lock["port"].as_u64().unwrap_or(58627);

    let token = fs::read_to_string(home.join("server.token"))
        .map_err(|e| format!("读取 server.token 失败（可先运行一次 `kimi web`）：{e}"))?;
    let token = token.trim().to_string();

    let base = format!("http://{host}:{port}");
    Ok(Launch { base, token })
}
