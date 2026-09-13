// 终端抽屉的本地 PTY 后端。
//
// daemon 的 terminal 能力依赖 node-pty,而原生安装的 daemon 是 Node SEA
// 单文件(不能从磁盘 require 原生模块,ERR_UNKNOWN_BUILTIN_MODULE),该路径
// 结构性不可用;官方 web 端连同一 daemon 也一样。桌面端由壳直接提供 PTY,
// 浏览器模式仍走 daemon(见 web/src/composables/useTerminal.ts 的双后端)。

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyInfo {
    pub id: u32,
    pub shell: String,
    pub cwd: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputEvent {
    id: u32,
    data: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    id: u32,
    code: Option<i32>,
}

struct PtySession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Arc<Mutex<Box<dyn ChildKiller + Send>>>,
}

fn sessions() -> &'static Mutex<HashMap<u32, PtySession>> {
    static MAP: OnceLock<Mutex<HashMap<u32, PtySession>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_id() -> u32 {
    static COUNTER: AtomicU32 = AtomicU32::new(1);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

fn default_shell() -> String {
    if cfg!(windows) {
        return "powershell.exe".into();
    }
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into())
}

/// 把字节流解码成 UTF-8 文本,末尾不完整的序列(CJK 跨块)留在 pending 里
/// 等下一块;中段非法字节替换为 U+FFFD 而不是丢弃。
fn decode_with_carry(chunk: &[u8], pending: &mut Vec<u8>) -> String {
    pending.extend_from_slice(chunk);
    let mut text = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(valid) => {
                text.push_str(valid);
                pending.clear();
                return text;
            }
            Err(err) => {
                let valid_up_to = err.valid_up_to();
                // SAFETY-free: from_utf8 已确认 [..valid_up_to] 合法。
                text.push_str(std::str::from_utf8(&pending[..valid_up_to]).unwrap_or(""));
                match err.error_len() {
                    Some(invalid_len) => {
                        text.push('\u{FFFD}');
                        pending.drain(..valid_up_to + invalid_len);
                    }
                    None => {
                        // 结尾是不完整序列:留着等下一块。
                        pending.drain(..valid_up_to);
                        return text;
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn pty_create(app: AppHandle, cwd: String, cols: u16, rows: u16) -> Result<PtyInfo, String> {
    let shell = default_shell();
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(&shell);
    if !cwd.is_empty() {
        cmd.cwd(&cwd);
    }
    cmd.env("TERM", "xterm-256color");
    if !cfg!(windows) {
        // 登录 shell:拿到用户 profile 里的 PATH(nvm/brew 等),对齐 Terminal.app。
        cmd.arg("-l");
    }
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn {shell} 失败:{e}"))?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let killer = child.clone_killer();
    let id = next_id();

    sessions().lock().unwrap().insert(
        id,
        PtySession {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            killer: Arc::new(Mutex::new(killer)),
        },
    );

    let output_app = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let text = decode_with_carry(&buf[..n], &mut pending);
                    if !text.is_empty() {
                        let _ = output_app.emit("pty-output", OutputEvent { id, data: text });
                    }
                }
            }
        }
        if !pending.is_empty() {
            let tail = String::from_utf8_lossy(&pending).into_owned();
            let _ = output_app.emit("pty-output", OutputEvent { id, data: tail });
        }
    });

    std::thread::spawn(move || {
        let code = child.wait().ok().map(|status| status.exit_code() as i32);
        // 会话表移除会连带 drop master/writer,PTY 随之关闭。
        sessions().lock().unwrap().remove(&id);
        let _ = app.emit("pty-exit", ExitEvent { id, code });
    });

    Ok(PtyInfo {
        id,
        shell,
        cwd: if cwd.is_empty() {
            std::env::current_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        } else {
            cwd
        },
    })
}

#[tauri::command]
pub fn pty_write(id: u32, data: String) -> Result<(), String> {
    // 先克隆 Arc 再放掉表锁,避免锁表跨越慢 IO。
    let writer = {
        let map = sessions().lock().unwrap();
        map.get(&id).ok_or("终端已退出")?.writer.clone()
    };
    let mut writer = writer.lock().unwrap();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let master = {
        let map = sessions().lock().unwrap();
        map.get(&id).ok_or("终端已退出")?.master.clone()
    };
    let size = PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    };
    // 绑定到具名变量:作为函数尾表达式时,guard 临时值会活到函数尾、越过 master 的 drop。
    let mut guard = master.lock().unwrap();
    guard.resize(size).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(id: u32) -> Result<(), String> {
    if let Some(session) = sessions().lock().unwrap().remove(&id) {
        let _ = session.killer.lock().unwrap().kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::decode_with_carry;

    #[test]
    fn decodes_plain_ascii_in_one_pass() {
        let mut pending = Vec::new();
        assert_eq!(decode_with_carry(b"hello", &mut pending), "hello");
        assert!(pending.is_empty());
    }

    #[test]
    fn carries_incomplete_multibyte_tail_to_next_chunk() {
        let mut pending = Vec::new();
        // 「你」= E4 BD A0,先到前两个字节。
        assert_eq!(decode_with_carry(&[0xE4, 0xBD], &mut pending), "");
        assert_eq!(pending, vec![0xE4, 0xBD]);
        assert_eq!(decode_with_carry(&[0xA0, 0x21], &mut pending), "你!");
        assert!(pending.is_empty());
    }

    #[test]
    fn replaces_midstream_invalid_byte_and_keeps_going() {
        let mut pending = Vec::new();
        let text = decode_with_carry(&[b'a', 0xFF, b'b'], &mut pending);
        assert_eq!(text, "a\u{FFFD}b");
        assert!(pending.is_empty());
    }
}
