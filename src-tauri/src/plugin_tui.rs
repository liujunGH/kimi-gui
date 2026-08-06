//! Embedded Kimi `/plugins` TUI session.
//!
//! Kimi Code 0.33 exposes the complete plugin management contract to its TUI,
//! but does not register equivalent kap-server REST routes.  Keep the GUI
//! bridge deliberately narrow: it may only launch the installed `kimi` binary,
//! type the fixed `/plugins` command, and relay terminal bytes.  It cannot run
//! arbitrary commands or choose an arbitrary executable.

use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::State;

use crate::daemon::{find_kimi, kimi_home};

const DEFAULT_COLS: u16 = 120;
const DEFAULT_ROWS: u16 = 36;
const MIN_COLS: u16 = 40;
const MAX_COLS: u16 = 400;
const MIN_ROWS: u16 = 12;
const MAX_ROWS: u16 = 200;
const MAX_BUFFERED_OUTPUT: usize = 2 * 1024 * 1024;

type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;
type SharedOutput = Arc<Mutex<Vec<u8>>>;

pub struct PluginTuiState(Mutex<Option<PluginTuiSession>>);

impl Default for PluginTuiState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

struct PluginTuiSession {
    master: Box<dyn MasterPty + Send>,
    writer: SharedWriter,
    child: Box<dyn Child + Send + Sync>,
    output: SharedOutput,
    running: Arc<AtomicBool>,
    pid: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginTuiSnapshot {
    output: String,
    running: bool,
    pid: Option<u32>,
}

fn clamp_size(cols: Option<u16>, rows: Option<u16>) -> PtySize {
    PtySize {
        cols: cols.unwrap_or(DEFAULT_COLS).clamp(MIN_COLS, MAX_COLS),
        rows: rows.unwrap_or(DEFAULT_ROWS).clamp(MIN_ROWS, MAX_ROWS),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn write_plugin_command(writer: &SharedWriter) {
    if let Ok(mut writer) = writer.lock() {
        let _ = writer.write_all(b"\x1b");
        let _ = writer.flush();
    }
    thread::sleep(Duration::from_millis(220));
    if let Ok(mut writer) = writer.lock() {
        let _ = writer.write_all(b"/plugins");
        let _ = writer.flush();
    }
    // Kimi's editor deliberately treats a burst ending in CR as pasted
    // multiline text.  Keep the synthetic keypress separate so Enter submits
    // the command exactly like a physical keyboard event.
    thread::sleep(Duration::from_millis(250));
    if let Ok(mut writer) = writer.lock() {
        let _ = writer.write_all(b"\r");
        let _ = writer.flush();
    }
}

fn queue_plugin_command(writer: SharedWriter, delay: Duration) {
    thread::spawn(move || {
        thread::sleep(delay);
        write_plugin_command(&writer);
    });
}

fn queue_initial_plugin_command(writer: SharedWriter, boot_output: SharedOutput) {
    thread::spawn(move || {
        // A fresh 0.33 workspace may show the official trust prompt before it
        // accepts slash commands.  Never answer that security decision for the
        // user.  Wait until the normal composer is visible, then open /plugins;
        // if trust is declined the process exits and the write is harmless.
        let mut saw_trust_prompt = false;
        for _ in 0..150 {
            thread::sleep(Duration::from_millis(100));
            let (has_trust_prompt, has_composer) = boot_output
                .lock()
                .map(|buffer| {
                    let text = String::from_utf8_lossy(&buffer);
                    (
                        text.contains("Trust this folder?"),
                        text.contains("Welcome to Kimi Code!"),
                    )
                })
                .unwrap_or((false, false));
            if has_trust_prompt {
                saw_trust_prompt = true;
            }
            if has_composer {
                write_plugin_command(&writer);
                return;
            }
        }
        if !saw_trust_prompt {
            write_plugin_command(&writer);
        }
    });
}

fn registered_workspace_root(workspace_root: Option<&str>) -> Result<PathBuf, String> {
    let requested = workspace_root
        .map(str::trim)
        .filter(|root| !root.is_empty())
        .ok_or("请先在主界面选择一个工作区")?;
    if requested.len() > 4_096 || requested.contains('\0') {
        return Err("工作区路径无效".to_string());
    }
    let canonical = PathBuf::from(requested)
        .canonicalize()
        .map_err(|error| format!("读取工作区失败: {error}"))?;
    if !canonical.is_dir() {
        return Err("工作区目录不存在".to_string());
    }

    let registry = std::fs::read_to_string(kimi_home().join("workspaces.json"))
        .map_err(|error| format!("读取 Kimi 工作区登记失败: {error}"))?;
    let registry: serde_json::Value = serde_json::from_str(&registry)
        .map_err(|error| format!("解析 Kimi 工作区登记失败: {error}"))?;
    let registered = registry
        .get("workspaces")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|workspaces| {
            workspaces.values().any(|workspace| {
                workspace
                    .get("root")
                    .and_then(serde_json::Value::as_str)
                    .and_then(|root| PathBuf::from(root).canonicalize().ok())
                    .is_some_and(|root| root == canonical)
            })
        });
    if !registered {
        return Err("只能从 Kimi 已登记的工作区启动插件管理器".to_string());
    }
    Ok(canonical)
}

fn stop_session(mut session: PluginTuiSession) {
    session.running.store(false, Ordering::Release);
    let _ = session.child.kill();
    let _ = session.child.wait();
}

#[tauri::command]
pub fn start_kimi_plugin_tui(
    state: State<'_, PluginTuiState>,
    cols: Option<u16>,
    rows: Option<u16>,
    workspace_root: Option<String>,
) -> Result<PluginTuiSnapshot, String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    if let Some(previous) = guard.take() {
        stop_session(previous);
    }

    let executable = find_kimi().ok_or("找不到 Kimi CLI，请先安装或更新 Kimi Code 0.33+")?;
    let size = clamp_size(cols, rows);
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|error| format!("创建内嵌终端失败: {error}"))?;

    let mut command = CommandBuilder::new(&executable);
    // Plugin state is app-global, but the TUI still starts in a workspace.
    // Reuse the GUI's selected registered workspace so plugin management does
    // not create a synthetic empty workspace in Kimi's registry.
    let cwd = registered_workspace_root(workspace_root.as_deref())?;
    command.cwd(cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("启动 Kimi 插件管理器失败: {error}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("读取内嵌终端失败: {error}"))?;
    let writer: SharedWriter = Arc::new(Mutex::new(
        pair.master
            .take_writer()
            .map_err(|error| format!("连接内嵌终端输入失败: {error}"))?,
    ));
    let output = Arc::new(Mutex::new(Vec::new()));
    let boot_output = Arc::new(Mutex::new(Vec::new()));
    let running = Arc::new(AtomicBool::new(true));
    let reader_output = Arc::clone(&output);
    let reader_boot_output = Arc::clone(&boot_output);
    let reader_running = Arc::clone(&running);
    thread::spawn(move || {
        let mut chunk = [0_u8; 16 * 1024];
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let Ok(mut buffer) = reader_output.lock() else {
                        break;
                    };
                    if buffer.len() + read > MAX_BUFFERED_OUTPUT {
                        let discard = (buffer.len() + read) - MAX_BUFFERED_OUTPUT;
                        if discard >= buffer.len() {
                            buffer.clear();
                        } else {
                            buffer.drain(..discard);
                        }
                    }
                    buffer.extend_from_slice(&chunk[..read]);
                    if let Ok(mut boot_buffer) = reader_boot_output.lock() {
                        if boot_buffer.len() < 256 * 1024 {
                            let remaining = (256 * 1024) - boot_buffer.len();
                            boot_buffer.extend_from_slice(&chunk[..read.min(remaining)]);
                        }
                    }
                }
            }
        }
        reader_running.store(false, Ordering::Release);
    });

    let pid = child.process_id();
    queue_initial_plugin_command(Arc::clone(&writer), boot_output);
    *guard = Some(PluginTuiSession {
        master: pair.master,
        writer,
        child,
        output,
        running,
        pid,
    });

    Ok(PluginTuiSnapshot {
        output: String::new(),
        running: true,
        pid,
    })
}

#[tauri::command]
pub fn read_kimi_plugin_tui(state: State<'_, PluginTuiState>) -> Result<PluginTuiSnapshot, String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    let Some(session) = guard.as_mut() else {
        return Ok(PluginTuiSnapshot {
            output: String::new(),
            running: false,
            pid: None,
        });
    };
    if session.running.load(Ordering::Acquire) {
        if let Ok(Some(_)) = session.child.try_wait() {
            session.running.store(false, Ordering::Release);
        }
    }
    let output = {
        let mut buffer = session.output.lock().map_err(|error| error.to_string())?;
        let text = String::from_utf8_lossy(&buffer).into_owned();
        buffer.clear();
        text
    };
    Ok(PluginTuiSnapshot {
        output,
        running: session.running.load(Ordering::Acquire),
        pid: session.pid,
    })
}

#[tauri::command]
pub fn write_kimi_plugin_tui(state: State<'_, PluginTuiState>, data: String) -> Result<(), String> {
    if data.len() > 64 * 1024 {
        return Err("单次终端输入过大".to_string());
    }
    let guard = state.0.lock().map_err(|error| error.to_string())?;
    let session = guard.as_ref().ok_or("插件管理器尚未启动")?;
    if !session.running.load(Ordering::Acquire) {
        return Err("插件管理器已经退出".to_string());
    }
    let mut writer = session.writer.lock().map_err(|error| error.to_string())?;
    writer
        .write_all(data.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|error| format!("写入内嵌终端失败: {error}"))
}

#[tauri::command]
pub fn open_kimi_plugin_tui(state: State<'_, PluginTuiState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|error| error.to_string())?;
    let session = guard.as_ref().ok_or("插件管理器尚未启动")?;
    if !session.running.load(Ordering::Acquire) {
        return Err("插件管理器已经退出".to_string());
    }
    queue_plugin_command(Arc::clone(&session.writer), Duration::ZERO);
    Ok(())
}

#[tauri::command]
pub fn resize_kimi_plugin_tui(
    state: State<'_, PluginTuiState>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|error| error.to_string())?;
    let session = guard.as_ref().ok_or("插件管理器尚未启动")?;
    session
        .master
        .resize(clamp_size(cols, rows))
        .map_err(|error| format!("调整内嵌终端尺寸失败: {error}"))
}

#[tauri::command]
pub fn stop_kimi_plugin_tui(state: State<'_, PluginTuiState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    if let Some(session) = guard.take() {
        stop_session(session);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pty_size_uses_safe_defaults_and_bounds() {
        assert_eq!(
            clamp_size(None, None),
            PtySize {
                cols: 120,
                rows: 36,
                pixel_width: 0,
                pixel_height: 0
            }
        );
        assert_eq!(clamp_size(Some(1), Some(1)).cols, MIN_COLS);
        assert_eq!(clamp_size(Some(u16::MAX), Some(u16::MAX)).rows, MAX_ROWS);
    }
}
