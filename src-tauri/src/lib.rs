// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod daemon;
mod dock_badge;
mod shortcut;
mod tray;

use daemon::{connect_daemon, Launch};
use std::sync::Mutex;
use tauri::{Manager, State, WindowEvent};

/// 缓存一次 daemon 连接信息,供 `daemon_info` 命令返回给前端。
/// 启动时 `setup` 钩子异步调用 `connect_daemon` 写入;前端通过 invoke 读取。
struct SharedDaemon(Mutex<Option<Launch>>);

/// 启动后前端调一次,拿 base URL + token。
/// daemon 还在连接中时返回 Err,前端可重试。
#[tauri::command]
fn daemon_info(state: State<'_, SharedDaemon>) -> Result<Launch, String> {
    state
        .0
        .lock()
        .map_err(|e| format!("lock error: {e}"))?
        .clone()
        .ok_or_else(|| "daemon 未连接(可能仍在启动中,稍后重试)".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // 全局快捷键 plugin(builder 构造,内部已注册 Cmd+Option+N)
        .plugin(shortcut::build_global_shortcut_plugin())
        .manage(SharedDaemon(Mutex::new(None)))
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 1. daemon 连接异步化(原同步阻塞启动,改为 thread::spawn,不卡窗口)
            //    connect_daemon 内部 spawn kimi server run,可能要几秒,不能阻塞 setup。
            std::thread::spawn(move || match connect_daemon() {
                Ok(launch) => {
                    let state: State<'_, SharedDaemon> = app_handle.state();
                    *state.0.lock().unwrap() = Some(launch);
                }
                Err(e) => {
                    eprintln!("[kimi-gui] daemon 连接失败: {e}");
                }
            });

            // 2. 系统托盘
            if let Err(e) = tray::setup_tray(app.handle()) {
                eprintln!("[kimi-gui] 托盘装配失败: {e}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 主窗点 × 时隐藏到托盘,不退出应用(用户从托盘恢复)
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            daemon_info,
            dock_badge::set_dock_badge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
