// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod daemon;
mod dock_badge;
mod plugin_tui;
mod runtime;
mod shortcut;
mod tray;
mod usage;

use daemon::{connect_daemon, read_gui_experiments, restart_daemon, save_gui_experiments, Launch};
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

/// Env-gated daemon experiments (tower / remote-control). Persisted on disk so
/// both the auto-connect and restart paths inject them; takes effect on the
/// next daemon start.
#[tauri::command]
fn kimi_experimental_env() -> Vec<String> {
    read_gui_experiments()
}

#[tauri::command]
fn set_kimi_experimental_env(enabled: Vec<String>) -> Result<(), String> {
    save_gui_experiments(enabled)
}

/// 使用当前已安装的 Kimi CLI，原端口原凭证重启 GUI 正在连接的 daemon。
/// shutdown 及新进程就绪都在阻塞线程完成，避免冻结 WebView。
#[tauri::command]
async fn restart_kimi_daemon(state: State<'_, SharedDaemon>) -> Result<Launch, String> {
    let current = state
        .0
        .lock()
        .map_err(|e| format!("lock error: {e}"))?
        .clone()
        .ok_or("daemon 尚未连接")?;
    let next = tauri::async_runtime::spawn_blocking(move || restart_daemon(&current))
        .await
        .map_err(|e| e.to_string())??;
    *state.0.lock().map_err(|e| format!("lock error: {e}"))? = Some(next.clone());
    Ok(next)
}

/// 应用内退出入口(设置页/命令面板;托盘菜单之外的兜底退出路径)。
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Native drag/drop exposes absolute paths but does not classify them. Keep
/// this tiny check in Rust so the WebView only registers dropped directories
/// as workspaces and leaves dropped files to the composer attachment flow.
#[tauri::command]
fn path_is_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // 原生文件/文件夹选择对话框(新建任务 → 添加工作区)
        .plugin(tauri_plugin_dialog::init())
        // 应用自动更新(GitHub Releases latest.json + 签名校验)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // 全局快捷键 plugin(builder 构造,内部已注册 Cmd+Option+N)
        .plugin(shortcut::build_global_shortcut_plugin())
        .manage(SharedDaemon(Mutex::new(None)))
        .manage(plugin_tui::PluginTuiState::default())
        .invoke_handler(tauri::generate_handler![
            daemon_info,
            restart_kimi_daemon,
            kimi_experimental_env,
            set_kimi_experimental_env,
            quit_app,
            path_is_directory,
            dock_badge::set_dock_badge,
            usage::plan_usage,
            runtime::kimi_engine_status,
            runtime::migrate_kimi_033_config,
            runtime::clear_secondary_model_pool,
            runtime::list_kimi_agents,
            runtime::save_kimi_agent,
            runtime::delete_kimi_agent,
            runtime::read_kimi_system_prompt,
            runtime::save_kimi_system_prompt,
            runtime::list_kimi_mcp_config,
            runtime::save_kimi_mcp_server,
            runtime::delete_kimi_mcp_server,
            runtime::read_kimi_workspace_context,
            runtime::save_kimi_workspace_context,
            runtime::read_kimi_performance_config,
            runtime::save_kimi_performance_config,
            runtime::create_kimi_settings_backup,
            runtime::inspect_kimi_settings_backup,
            runtime::restore_kimi_settings_backup,
            runtime::detect_orphan_kimi_sessions,
            runtime::cleanup_orphan_kimi_session,
            runtime::delete_archived_kimi_session,
            runtime::run_kimi_provider_command,
            runtime::run_kimi_maintenance,
            plugin_tui::start_kimi_plugin_tui,
            plugin_tui::read_kimi_plugin_tui,
            plugin_tui::write_kimi_plugin_tui,
            plugin_tui::open_kimi_plugin_tui,
            plugin_tui::resize_kimi_plugin_tui,
            plugin_tui::stop_kimi_plugin_tui
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 1. daemon 连接异步化(原同步阻塞启动,改为 thread::spawn,不卡窗口)
            //    connect_daemon 内部 spawn kimi server run,可能要几秒,不能阻塞 setup。
            std::thread::spawn(move || match connect_daemon() {
                Ok(launch) => {
                    let state: State<'_, SharedDaemon> = app_handle.state();
                    match state.0.lock() {
                        Ok(mut guard) => *guard = Some(launch.clone()),
                        Err(_) => {
                            eprintln!("[kimi-gui] daemon 状态锁已 poison,跳过写实例信息");
                        }
                    };
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
