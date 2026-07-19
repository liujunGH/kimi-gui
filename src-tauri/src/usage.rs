//! 计划额度抓取(复刻 kimi-ui 的 PTY 抓取方案,已验证可行)
//!
//! daemon 无额度 REST 端点(usage/quota/account/rate-limits 等全路径实测 404),
//! 但 CLI TUI 的 `/usage` 会渲染计划额度(Weekly / 5h limit)。做法与 kimi-ui 一致:
//! 嵌入式 PTY 起无头 TUI(throwaway KIMI_CODE_HOME 放凭据副本,不污染真实数据目录),
//! ESC 清首启对话框 → 发送 `/usage` → 单独发 `\r` 提交 → vt100 解析渲染结果,
//! 提取两行 "X% used ... resets in Y"。
//! 缓存 TTL 600s,后台异步刷新,不阻塞启动。

use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde_json::Value;

use crate::daemon::{find_kimi, kimi_home};

/// 计划额度(TUI `/usage` 渲染值)。
#[derive(Clone, serde::Serialize)]
pub struct PlanUsage {
    weekly_pct: u32,
    weekly_reset: String,
    hourly_pct: u32,
    hourly_reset: String,
    fetched_at: u64,
}

static PLAN_USAGE: Mutex<Option<PlanUsage>> = Mutex::new(None);
static SCRAPE_RUNNING: AtomicBool = AtomicBool::new(false);

/// 抓取 TTL:前端怎么问都最多这个频率真抓一次。
const SCRAPE_TTL_SECS: u64 = 600;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 解析一行 "X% used ... resets in Y"(兼容行尾边框符)。
fn parse_usage_line(line: &str) -> Option<(u32, String)> {
    let pct_end = line.find("% used")?;
    let digits: String = line[..pct_end]
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let pct: u32 = digits.parse().ok()?;
    let reset = line
        .split("resets in ")
        .nth(1)?
        .trim()
        .trim_matches('│')
        .trim()
        .to_string();
    Some((pct, reset))
}

/// 复制文件或目录树(仅小的凭据目录)。
fn copy_tree(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_tree(&entry.path(), &dst.join(entry.file_name()))?;
        }
    } else if src.is_file() {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(src, dst)?;
    }
    Ok(())
}

/// 在嵌入式 PTY 中启动 `program`,清首启对话框后发送 input + 回车,
/// 返回 vt100 解析后的整屏文本(与 tmux capture-pane 等效,零外部依赖)。
fn run_in_pty(
    program: &PathBuf,
    cwd: &PathBuf,
    envs: &[(&str, &str)],
    input: &str,
    boot_wait: Duration,
    after_input_wait: Duration,
) -> Result<String, String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::{Read, Write};

    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 50,
            cols: 200,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(program);
    cmd.cwd(cwd);
    for (k, v) in envs {
        cmd.env(k, v);
    }
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn 失败:{e}"))?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
    thread::spawn(move || {
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    thread::sleep(boot_wait);
    // 清首启对话框(迁移提示等),再发送命令文本与回车。
    let _ = writer.write_all(b"\x1b");
    thread::sleep(Duration::from_millis(800));
    let _ = writer.write_all(input.as_bytes());
    let _ = writer.write_all(b"\r");
    thread::sleep(after_input_wait);

    let _ = child.kill();
    let _ = child.wait();
    drop(writer);
    thread::sleep(Duration::from_millis(300));
    let mut raw = Vec::new();
    while let Ok(chunk) = rx.try_recv() {
        raw.extend_from_slice(&chunk);
    }
    let mut parser = vt100::Parser::new(50, 200, 0);
    parser.process(&raw);
    Ok(parser.screen().contents())
}

/// 起无头 TUI 抓 /usage,耗时约 10s。
fn scrape_plan_usage() -> Result<PlanUsage, String> {
    let kimi = find_kimi().ok_or("找不到 kimi CLI")?;

    // throwaway home + 凭据副本:probe 会话及其产物不碰真实数据目录;
    // 迁移标记与 device_id 一并带上,避免首启对话框卡流程(ESC 兜底)。
    let sandbox = std::env::temp_dir().join(format!("kimi-usage-home-{}", std::process::id()));
    let _ = fs::remove_dir_all(&sandbox);
    fs::create_dir_all(&sandbox).map_err(|e| e.to_string())?;
    let real_home = kimi_home();
    for item in [
        "config.toml",
        "credentials",
        "oauth",
        "device_id",
        "migration-report.json",
    ] {
        let src = real_home.join(item);
        if src.exists() {
            let _ = copy_tree(&src, &sandbox.join(item));
        }
    }
    let probe = sandbox.join("probe");
    fs::create_dir_all(&probe).map_err(|e| e.to_string())?;

    let home_str = sandbox.display().to_string();
    let result = run_in_pty(
        &kimi,
        &probe,
        &[("KIMI_CODE_HOME", home_str.as_str())],
        "/usage",
        Duration::from_secs(6),
        Duration::from_secs(4),
    );
    let _ = fs::remove_dir_all(&sandbox);
    let text = result?;

    let mut weekly = None;
    let mut hourly = None;
    for line in text.lines() {
        if line.contains("Weekly limit") {
            weekly = parse_usage_line(line);
        } else if line.contains("5h limit") {
            hourly = parse_usage_line(line);
        }
    }
    match (weekly, hourly) {
        (Some((weekly_pct, weekly_reset)), Some((hourly_pct, hourly_reset))) => Ok(PlanUsage {
            weekly_pct,
            weekly_reset,
            hourly_pct,
            hourly_reset,
            fetched_at: now_secs(),
        }),
        _ => Err("解析 /usage 输出失败(TUI 格式可能已变化)".to_string()),
    }
}

/// 后台抓一次(防重入)。
fn refresh_background() {
    if SCRAPE_RUNNING.swap(true, Ordering::Relaxed) {
        return;
    }
    thread::spawn(|| {
        match scrape_plan_usage() {
            Ok(u) => {
                if let Ok(mut guard) = PLAN_USAGE.lock() {
                    *guard = Some(u);
                }
            }
            Err(e) => eprintln!("[kimi-gui] 额度抓取失败:{e}"),
        }
        SCRAPE_RUNNING.store(false, Ordering::Relaxed);
    });
}

/// 启动时预热缓存(不阻塞 setup)。
pub fn warm_cache() {
    refresh_background();
}

/// Tauri command:返回缓存的额度;过期则后台刷新,本次先返回缓存/loading。
#[tauri::command]
pub fn plan_usage() -> Value {
    let stale = PLAN_USAGE
        .lock()
        .map(|u| u.as_ref().map_or(true, |u| u.fetched_at + SCRAPE_TTL_SECS < now_secs()))
        .unwrap_or(true);
    if stale {
        refresh_background();
    }
    let guard = PLAN_USAGE.lock().ok();
    match guard.as_ref().and_then(|g| g.as_ref()) {
        Some(u) => serde_json::to_value(u).unwrap_or_else(|_| Value::Null),
        None => serde_json::json!({ "loading": true }),
    }
}
