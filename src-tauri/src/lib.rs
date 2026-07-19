// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod daemon;

use daemon::{connect_daemon, Launch};
use std::sync::Mutex;
use tauri::{Manager, State};

/// 缓存一次 daemon 连接信息,供 `daemon_info` 命令返回给前端。
/// 启动时 `setup` 钩子调用 `connect_daemon` 写入;前端通过 invoke 读取。
struct SharedDaemon(Mutex<Option<Launch>>);

/// 启动后前端调一次,拿 base URL + token。
#[tauri::command]
fn daemon_info(state: State<'_, SharedDaemon>) -> Result<Launch, String> {
    state
        .0
        .lock()
        .map_err(|e| format!("lock error: {e}"))?
        .clone()
        .ok_or_else(|| "daemon 未连接".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(SharedDaemon(Mutex::new(None)))
        .setup(|app| {
            // 启动时连接 daemon,失败也不阻塞窗口(前端会显示连接错误 + 重试)。
            match connect_daemon() {
                Ok(launch) => {
                    let state: State<'_, SharedDaemon> = app.state();
                    *state.0.lock().unwrap() = Some(launch);
                }
                Err(e) => {
                    eprintln!("[kimi-gui] daemon 连接失败: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![daemon_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
