//! Native Kimi runtime integration used by Settings.
//!
//! Keep the command surface intentionally narrow: the webview cannot execute
//! arbitrary programs or read arbitrary files. Every path is resolved under a
//! documented Kimi directory (or the selected workspace's agent directories),
//! and maintenance actions are selected from a fixed allow-list.

use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::daemon::{find_kimi, kimi_home};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KimiEngineStatus {
    installed: bool,
    cli_path: Option<String>,
    version: Option<String>,
    home: String,
    config_path: String,
    system_prompt_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    name: String,
    description: String,
    when_to_use: Option<String>,
    model_preference: Option<String>,
    tools: Vec<String>,
    disallowed_tools: Vec<String>,
    prompt: String,
    path: String,
    scope: String,
    editable: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigEntry {
    name: String,
    scope: String,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    url: Option<String>,
    enabled: bool,
    has_sensitive_config: bool,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigInput {
    name: String,
    scope: String,
    workspace_root: Option<String>,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    url: Option<String>,
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceContextConfig {
    path: String,
    additional_dirs: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KimiPerformanceConfig {
    max_steps_per_turn: Option<u64>,
    max_attempts_per_step: u64,
    reserved_context_size: Option<u64>,
    max_running_tasks: Option<u64>,
    bash_auto_background_on_timeout: bool,
    bash_task_timeout_s: u64,
    subagent_timeout_ms: u64,
    mcp_startup_timeout_ms: u64,
    mcp_tool_timeout_ms: u64,
    token_counting_strategy: String,
    image_max_edge_px: u64,
    image_read_byte_budget: u64,
    cache_expiry_hint: bool,
}

impl Default for KimiPerformanceConfig {
    fn default() -> Self {
        Self {
            max_steps_per_turn: None,
            max_attempts_per_step: 10,
            reserved_context_size: None,
            max_running_tasks: None,
            bash_auto_background_on_timeout: true,
            bash_task_timeout_s: 600,
            subagent_timeout_ms: 7_200_000,
            mcp_startup_timeout_ms: 30_000,
            mcp_tool_timeout_ms: 60_000,
            token_counting_strategy: "measured+estimated".to_string(),
            image_max_edge_px: 2_000,
            image_read_byte_budget: 262_144,
            cache_expiry_hint: true,
        }
    }
}

const BACKUP_MAX_FILES: usize = 5_000;
const BACKUP_MAX_BYTES: u64 = 100 * 1024 * 1024;
const BACKUP_MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KimiBackupInfo {
    path: String,
    files: usize,
    bytes: u64,
    entries: Vec<String>,
    safety_snapshot_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Kimi033MigrationResult {
    changed: bool,
    backup_path: Option<String>,
    renamed_keys: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanSessionCleanupResult {
    session_id: String,
    backup_path: Option<String>,
    already_cleaned: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivedSessionDeleteResult {
    session_id: String,
    already_deleted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanSessionInfo {
    session_id: String,
    title: String,
    work_dir: String,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanSessionScanResult {
    items: Vec<OrphanSessionInfo>,
    total_bytes: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionIndexEntry {
    session_id: String,
    session_dir: String,
    work_dir: String,
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| {
            let Ok(metadata) = entry.path().symlink_metadata() else {
                return 0;
            };
            if metadata.is_file() {
                metadata.len()
            } else if metadata.is_dir() {
                directory_size(&entry.path())
            } else {
                0
            }
        })
        .sum()
}

fn session_title(session_dir: &Path, session_id: &str) -> String {
    fs::read_to_string(session_dir.join("state.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|state| state.get("title")?.as_str().map(str::to_string))
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| session_id.to_string())
}

fn detect_orphan_sessions_in_home(home: &Path) -> Result<OrphanSessionScanResult, String> {
    let index_path = home.join("session_index.jsonl");
    let index = fs::read_to_string(&index_path)
        .map_err(|error| format!("读取 Kimi 会话索引失败: {error}"))?;
    let sessions_root = home.join("sessions");
    let canonical_root = sessions_root
        .canonicalize()
        .map_err(|error| format!("读取 Kimi 会话目录失败: {error}"))?;
    let mut seen = HashSet::new();
    let mut items = Vec::new();

    for entry in index
        .lines()
        .filter_map(|line| serde_json::from_str::<SessionIndexEntry>(line).ok())
    {
        if !valid_session_id(&entry.session_id)
            || !seen.insert(entry.session_id.clone())
            || Path::new(&entry.work_dir).exists()
        {
            continue;
        }
        let session_dir = PathBuf::from(&entry.session_dir);
        let Ok(canonical_session) = session_dir.canonicalize() else {
            continue;
        };
        if !canonical_session.is_dir()
            || !canonical_session.starts_with(&canonical_root)
            || canonical_session.file_name().and_then(|name| name.to_str())
                != Some(entry.session_id.as_str())
        {
            continue;
        }
        items.push(OrphanSessionInfo {
            title: session_title(&canonical_session, &entry.session_id),
            bytes: directory_size(&canonical_session),
            session_id: entry.session_id,
            work_dir: entry.work_dir,
        });
    }
    items.sort_by(|left, right| left.title.cmp(&right.title));
    let total_bytes = items.iter().map(|item| item.bytes).sum();
    Ok(OrphanSessionScanResult { items, total_bytes })
}

#[tauri::command]
pub async fn detect_orphan_kimi_sessions() -> Result<OrphanSessionScanResult, String> {
    tauri::async_runtime::spawn_blocking(|| detect_orphan_sessions_in_home(&kimi_home()))
        .await
        .map_err(|error| error.to_string())?
}

fn valid_session_id(session_id: &str) -> bool {
    session_id.starts_with("session_")
        && (9..=96).contains(&session_id.len())
        && session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn valid_provider_id(value: &str) -> bool {
    (1..=96).contains(&value.len())
        && value
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_alphanumeric())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn valid_http_url(value: &str) -> bool {
    (value.starts_with("https://") || value.starts_with("http://"))
        && value.len() <= 2_048
        && !value.bytes().any(|byte| byte.is_ascii_whitespace())
}

fn cleanup_orphan_session_in_home(
    home: &Path,
    session_id: &str,
    backup: bool,
) -> Result<OrphanSessionCleanupResult, String> {
    if !valid_session_id(session_id) {
        return Err("无效的会话 ID".to_string());
    }

    let index_path = home.join("session_index.jsonl");
    let index = fs::read_to_string(&index_path)
        .map_err(|error| format!("读取 Kimi 会话索引失败: {error}"))?;
    let entry = index
        .lines()
        .filter_map(|line| serde_json::from_str::<SessionIndexEntry>(line).ok())
        .find(|entry| entry.session_id == session_id)
        .ok_or_else(|| "Kimi 会话索引中找不到这个任务".to_string())?;

    let work_dir = PathBuf::from(&entry.work_dir);
    if work_dir.exists() {
        return Err("任务工作区仍然存在，请使用普通归档".to_string());
    }

    let session_dir = PathBuf::from(&entry.session_dir);
    if !session_dir.exists() {
        return Ok(OrphanSessionCleanupResult {
            session_id: session_id.to_string(),
            backup_path: None,
            already_cleaned: true,
        });
    }

    let sessions_root = home.join("sessions");
    let canonical_root = sessions_root
        .canonicalize()
        .map_err(|error| format!("读取 Kimi 会话目录失败: {error}"))?;
    let canonical_session = session_dir
        .canonicalize()
        .map_err(|error| format!("读取任务目录失败: {error}"))?;
    if !canonical_session.is_dir()
        || !canonical_session.starts_with(&canonical_root)
        || canonical_session.file_name().and_then(|name| name.to_str()) != Some(session_id)
    {
        return Err("会话目录不在 Kimi 数据目录内，已拒绝清理".to_string());
    }

    // Kimi Visualizer 的删除也是按 sessionDir 处理。GUI 使用同一边界，
    // 但把是否保留可恢复副本交给用户明确选择。
    let backup_path = if backup {
        let backup_root = home.join("orphaned-sessions");
        fs::create_dir_all(&backup_root)
            .map_err(|error| format!("创建失效任务备份目录失败: {error}"))?;
        let backup_dir = backup_root.join(format!(
            "{}-{}-{}",
            timestamp(),
            std::process::id(),
            session_id
        ));
        fs::rename(&canonical_session, &backup_dir)
            .map_err(|error| format!("移动失效任务到备份目录失败: {error}"))?;
        Some(backup_dir.display().to_string())
    } else {
        fs::remove_dir_all(&canonical_session)
            .map_err(|error| format!("删除失效任务记录失败: {error}"))?;
        None
    };

    Ok(OrphanSessionCleanupResult {
        session_id: session_id.to_string(),
        backup_path,
        already_cleaned: false,
    })
}

/// 清理由 Kimi 索引保留、但工作区已经不存在的失效任务。
///
/// 该命令不接受任意路径，也不会删除正常任务。用户可选择直接删除，
/// 或移动到 ~/.kimi-code/orphaned-sessions 后再从列表清理。
#[tauri::command]
pub fn cleanup_orphan_kimi_session(
    session_id: String,
    backup: bool,
) -> Result<OrphanSessionCleanupResult, String> {
    cleanup_orphan_session_in_home(&kimi_home(), &session_id, backup)
}

fn delete_archived_session_in_home(
    home: &Path,
    session_id: &str,
) -> Result<ArchivedSessionDeleteResult, String> {
    if !valid_session_id(session_id) {
        return Err("无效的会话 ID".to_string());
    }

    let index_path = home.join("session_index.jsonl");
    let index = fs::read_to_string(&index_path)
        .map_err(|error| format!("读取 Kimi 会话索引失败: {error}"))?;
    let entry = index
        .lines()
        .filter_map(|line| serde_json::from_str::<SessionIndexEntry>(line).ok())
        .find(|entry| entry.session_id == session_id)
        .ok_or_else(|| "Kimi 会话索引中找不到这个任务".to_string())?;
    let session_dir = PathBuf::from(&entry.session_dir);
    if !session_dir.exists() {
        return Ok(ArchivedSessionDeleteResult {
            session_id: session_id.to_string(),
            already_deleted: true,
        });
    }

    let sessions_root = home.join("sessions");
    let canonical_root = sessions_root
        .canonicalize()
        .map_err(|error| format!("读取 Kimi 会话目录失败: {error}"))?;
    let canonical_session = session_dir
        .canonicalize()
        .map_err(|error| format!("读取任务目录失败: {error}"))?;
    if !canonical_session.is_dir()
        || !canonical_session.starts_with(&canonical_root)
        || canonical_session.file_name().and_then(|name| name.to_str()) != Some(session_id)
    {
        return Err("会话目录不在 Kimi 数据目录内，已拒绝删除".to_string());
    }
    let state = fs::read_to_string(canonical_session.join("state.json"))
        .map_err(|error| format!("读取归档状态失败: {error}"))?;
    let archived = serde_json::from_str::<Value>(&state)
        .ok()
        .and_then(|value| value.get("archived").and_then(Value::as_bool))
        .unwrap_or(false);
    if !archived {
        return Err("这个任务尚未归档，已拒绝永久删除".to_string());
    }

    // Kimi daemon 0.33 的 REST 契约只有 archive/restore，没有永久删除。
    // 官方 Visualizer 也是在校验索引后删除精确的 sessionDir；这里再额外
    // 要求 state.json 明确标记 archived，避免 GUI 误删活动会话。
    fs::remove_dir_all(&canonical_session)
        .map_err(|error| format!("永久删除归档任务失败: {error}"))?;
    Ok(ArchivedSessionDeleteResult {
        session_id: session_id.to_string(),
        already_deleted: false,
    })
}

#[tauri::command]
pub fn delete_archived_kimi_session(
    session_id: String,
) -> Result<ArchivedSessionDeleteResult, String> {
    delete_archived_session_in_home(&kimi_home(), &session_id)
}

#[tauri::command]
pub async fn run_kimi_provider_command(
    action: String,
    provider_id: Option<String>,
    url: Option<String>,
    api_key: Option<String>,
    default_model: Option<String>,
    base_url: Option<String>,
    filter: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let kimi = find_kimi().ok_or("找不到 kimi CLI")?;
        let mut command = Command::new(kimi);
        let json_output = action == "catalog-list";
        command.arg("provider");
        match action.as_str() {
            "catalog-list" => {
                command.args(["catalog", "list"]);
                if let Some(id) = provider_id
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                {
                    if !valid_provider_id(id.trim()) {
                        return Err("无效的 Provider ID".to_string());
                    }
                    command.arg(id.trim());
                }
                if let Some(value) = filter.as_deref().filter(|value| !value.trim().is_empty()) {
                    if value.trim().len() > 120 {
                        return Err("搜索词过长".to_string());
                    }
                    command.args(["--filter", value.trim()]);
                }
                if let Some(value) = url.as_deref().filter(|value| !value.trim().is_empty()) {
                    if !valid_http_url(value.trim()) {
                        return Err("目录 URL 必须是有效的 http(s) 地址".to_string());
                    }
                    command.args(["--url", value.trim()]);
                }
                command.arg("--json");
            }
            "catalog-add" => {
                let id = provider_id
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or("缺少 Provider ID")?;
                if !valid_provider_id(id.trim()) {
                    return Err("无效的 Provider ID".to_string());
                }
                let key = api_key
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or("缺少 API Key")?;
                command.args(["catalog", "add", id.trim()]);
                command.env("KIMI_REGISTRY_API_KEY", key);
                if let Some(value) = default_model
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                {
                    command.args(["--default-model", value.trim()]);
                }
                if let Some(value) = base_url.as_deref().filter(|value| !value.trim().is_empty()) {
                    if !valid_http_url(value.trim()) {
                        return Err("Base URL 必须是有效的 http(s) 地址".to_string());
                    }
                    command.args(["--base-url", value.trim()]);
                }
                if let Some(value) = url.as_deref().filter(|value| !value.trim().is_empty()) {
                    if !valid_http_url(value.trim()) {
                        return Err("目录 URL 必须是有效的 http(s) 地址".to_string());
                    }
                    command.args(["--url", value.trim()]);
                }
            }
            "registry-add" => {
                let registry_url = url
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or("缺少 Registry URL")?;
                if !valid_http_url(registry_url.trim()) {
                    return Err("Registry URL 必须是有效的 http(s) 地址".to_string());
                }
                let key = api_key
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or("缺少 Registry API Key")?;
                command.args(["add", registry_url.trim()]);
                command.env("KIMI_REGISTRY_API_KEY", key);
            }
            _ => return Err("不支持的 Provider 操作".to_string()),
        }
        command.current_dir(kimi_home());
        if json_output {
            command_json(command)
        } else {
            command_text(command)
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

fn command_text(mut command: Command) -> Result<String, String> {
    let output = command.output().map_err(|e| format!("启动失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let text = if stdout.is_empty() {
        stderr
    } else if stderr.is_empty() {
        stdout
    } else {
        format!("{stdout}\n{stderr}")
    };
    if output.status.success() {
        Ok(text)
    } else {
        Err(if text.is_empty() {
            format!("命令退出: {}", output.status)
        } else {
            text
        })
    }
}

fn command_json(mut command: Command) -> Result<String, String> {
    let output = command
        .output()
        .map_err(|error| format!("启动失败: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }
    for candidate in [&stdout, &stderr] {
        if let Ok(value) = serde_json::from_str::<Value>(candidate) {
            return serde_json::to_string(&value).map_err(|error| error.to_string());
        }
        if let (Some(start), Some(end)) = (candidate.find('{'), candidate.rfind('}')) {
            if start <= end {
                let slice = &candidate[start..=end];
                if let Ok(value) = serde_json::from_str::<Value>(slice) {
                    return serde_json::to_string(&value).map_err(|error| error.to_string());
                }
            }
        }
    }
    Err(if stdout.is_empty() && stderr.is_empty() {
        "模型目录没有返回 JSON 数据".to_string()
    } else {
        "模型目录返回了无法识别的数据".to_string()
    })
}

#[tauri::command]
pub fn kimi_engine_status() -> KimiEngineStatus {
    let home = kimi_home();
    let cli = find_kimi();
    let version = cli.as_ref().and_then(|path| {
        let mut command = Command::new(path);
        command.arg("--version");
        command_text(command).ok()
    });
    KimiEngineStatus {
        installed: cli.is_some(),
        cli_path: cli.map(|path| path.display().to_string()),
        version,
        config_path: home.join("config.toml").display().to_string(),
        system_prompt_path: home.join("SYSTEM.md").display().to_string(),
        home: home.display().to_string(),
    }
}

fn rename_loop_control_key(line: &str, old: &str, new: &str) -> Option<String> {
    let indent_len = line.len() - line.trim_start().len();
    let trimmed = &line[indent_len..];
    let suffix = trimmed.strip_prefix(old)?;
    if !suffix.trim_start().starts_with('=') {
        return None;
    }
    Some(format!("{}{}{}", &line[..indent_len], new, suffix))
}

fn loop_control_has_key(content: &str, key: &str) -> bool {
    let mut in_loop_control = false;
    for line in content.lines() {
        let section = line.trim();
        if section.starts_with('[') && section.ends_with(']') {
            in_loop_control = section == "[loop_control]";
            continue;
        }
        if in_loop_control && rename_loop_control_key(line, key, key).is_some() {
            return true;
        }
    }
    false
}

fn migrate_loop_control_config(content: &str) -> (String, Vec<String>) {
    let has_attempts = loop_control_has_key(content, "max_attempts_per_step");
    let has_turn_steps = loop_control_has_key(content, "max_steps_per_turn");
    let mut in_loop_control = false;
    let mut renamed_keys = Vec::new();
    let mut output = String::with_capacity(content.len());
    for chunk in content.split_inclusive('\n') {
        let (line, newline) = chunk
            .strip_suffix('\n')
            .map(|line| (line, "\n"))
            .unwrap_or((chunk, ""));
        let section = line.trim();
        if section.starts_with('[') && section.ends_with(']') {
            in_loop_control = section == "[loop_control]";
        }
        let migrated = if in_loop_control {
            if let Some(next) =
                rename_loop_control_key(line, "max_retries_per_step", "max_attempts_per_step")
            {
                if has_attempts {
                    renamed_keys.push(
                        "移除重复 max_retries_per_step（保留 max_attempts_per_step）".to_string(),
                    );
                    format!("# deprecated by Kimi Code 0.33: {line}")
                } else {
                    renamed_keys.push("max_retries_per_step → max_attempts_per_step".to_string());
                    next
                }
            } else if let Some(next) =
                rename_loop_control_key(line, "max_steps_per_run", "max_steps_per_turn")
            {
                if has_turn_steps {
                    renamed_keys
                        .push("移除重复 max_steps_per_run（保留 max_steps_per_turn）".to_string());
                    format!("# deprecated by Kimi Code 0.33: {line}")
                } else {
                    renamed_keys.push("max_steps_per_run → max_steps_per_turn".to_string());
                    next
                }
            } else {
                line.to_string()
            }
        } else {
            line.to_string()
        };
        output.push_str(&migrated);
        output.push_str(newline);
    }
    (output, renamed_keys)
}

#[tauri::command]
pub fn migrate_kimi_033_config() -> Result<Kimi033MigrationResult, String> {
    let path = kimi_home().join("config.toml");
    if !path.exists() {
        return Ok(Kimi033MigrationResult {
            changed: false,
            backup_path: None,
            renamed_keys: Vec::new(),
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取 config.toml 失败: {e}"))?;
    if content.len() > 4 * 1024 * 1024 {
        return Err("config.toml 超过 4 MiB，拒绝自动迁移".to_string());
    }

    let (output, renamed_keys) = migrate_loop_control_config(&content);

    if renamed_keys.is_empty() {
        return Ok(Kimi033MigrationResult {
            changed: false,
            backup_path: None,
            renamed_keys,
        });
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let backup = path.with_file_name(format!("config.toml.pre-0.33-{stamp}.bak"));
    fs::copy(&path, &backup).map_err(|e| format!("创建 config 备份失败: {e}"))?;
    let temporary = path.with_file_name(format!(".config.toml.migrate-{}", std::process::id()));
    fs::write(&temporary, output).map_err(|e| format!("写入迁移文件失败: {e}"))?;
    // std::fs::rename does not replace an existing file on Windows. The backup
    // above is the rollback source for the short remove/rename window.
    fs::remove_file(&path).map_err(|e| format!("准备替换 config.toml 失败: {e}"))?;
    if let Err(error) = fs::rename(&temporary, &path) {
        let _ = fs::remove_file(&temporary);
        let _ = fs::copy(&backup, &path);
        return Err(format!("替换 config.toml 失败: {error}"));
    }
    Ok(Kimi033MigrationResult {
        changed: true,
        backup_path: Some(backup.display().to_string()),
        renamed_keys,
    })
}

fn parse_list(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if trimmed == "[]" || trimmed.is_empty() {
        return Vec::new();
    }
    trimmed
        .trim_matches(|c| c == '[' || c == ']')
        .split(',')
        .map(|item| {
            item.trim()
                .trim_matches(|c| c == '"' || c == '\'')
                .to_string()
        })
        .filter(|item| !item.is_empty())
        .collect()
}

fn unquote(value: &str) -> String {
    let trimmed = value.trim();
    serde_json::from_str::<String>(trimmed)
        .unwrap_or_else(|_| trimmed.trim_matches(|c| c == '"' || c == '\'').to_string())
}

fn parse_agent(path: &Path, scope: &str, editable: bool) -> Option<AgentProfile> {
    let content = fs::read_to_string(path).ok()?;
    if content.len() > 512 * 1024 {
        return None;
    }
    let fallback_name = path.file_stem()?.to_string_lossy().to_string();
    let mut name = fallback_name;
    let mut description = String::new();
    let mut when_to_use = None;
    let mut model_preference = None;
    let mut tools = Vec::new();
    let mut disallowed_tools = Vec::new();
    let mut prompt = content.clone();

    if let Some(rest) = content.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let frontmatter = &rest[..end];
            prompt = rest[end + 4..].trim_start_matches(['\r', '\n']).to_string();
            let mut active_list: Option<&str> = None;
            for line in frontmatter.lines() {
                let trimmed = line.trim();
                if let Some(item) = trimmed.strip_prefix("- ") {
                    match active_list {
                        Some("tools") => tools.push(unquote(item)),
                        Some("disallowedTools") => disallowed_tools.push(unquote(item)),
                        _ => {}
                    }
                    continue;
                }
                let Some((key, value)) = trimmed.split_once(':') else {
                    continue;
                };
                let value = value.trim();
                active_list = None;
                match key.trim() {
                    "name" => name = unquote(value),
                    "description" => description = unquote(value),
                    "whenToUse" => when_to_use = Some(unquote(value)),
                    "model_preference" => model_preference = Some(unquote(value)),
                    "tools" => {
                        active_list = Some("tools");
                        tools.extend(parse_list(value));
                    }
                    "disallowedTools" => {
                        active_list = Some("disallowedTools");
                        disallowed_tools.extend(parse_list(value));
                    }
                    _ => {}
                }
            }
        }
    }

    Some(AgentProfile {
        name,
        description,
        when_to_use,
        model_preference,
        tools,
        disallowed_tools,
        prompt,
        path: path.display().to_string(),
        scope: scope.to_string(),
        editable,
    })
}

fn scan_markdown(
    dir: &Path,
    scope: &str,
    editable: bool,
    out: &mut Vec<AgentProfile>,
    depth: usize,
) {
    if depth > 5 || out.len() >= 200 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_markdown(&path, scope, editable, out, depth + 1);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            if let Some(profile) = parse_agent(&path, scope, editable) {
                out.push(profile);
            }
        }
    }
}

#[tauri::command]
pub fn list_kimi_agents(workspace_root: Option<String>) -> Vec<AgentProfile> {
    let home = kimi_home();
    let mut profiles = Vec::new();
    scan_markdown(&home.join("agents"), "user", true, &mut profiles, 0);
    if let Some(real_home) = std::env::var_os("HOME").map(PathBuf::from) {
        scan_markdown(
            &real_home.join(".agents/agents"),
            "shared",
            false,
            &mut profiles,
            0,
        );
    }
    if let Some(root) = workspace_root.map(PathBuf::from) {
        scan_markdown(
            &root.join(".kimi-code/agents"),
            "project",
            false,
            &mut profiles,
            0,
        );
        scan_markdown(
            &root.join(".agents/agents"),
            "project-shared",
            false,
            &mut profiles,
            0,
        );
    }
    profiles.sort_by(|a, b| a.name.cmp(&b.name).then(a.scope.cmp(&b.scope)));
    profiles
}

fn valid_agent_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && name
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
        && name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("无效路径")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(
        ".{}.tmp-{}",
        path.file_name().unwrap_or_default().to_string_lossy(),
        std::process::id()
    ));
    fs::write(&temp, content).map_err(|e| e.to_string())?;
    fs::rename(&temp, path).map_err(|e| e.to_string())
}

fn read_toml_or_empty(path: &Path) -> Result<toml::Value, String> {
    if !path.exists() {
        return Ok(toml::Value::Table(toml::map::Map::new()));
    }
    fs::read_to_string(path)
        .map_err(|e| e.to_string())?
        .parse::<toml::Value>()
        .map_err(|e| format!("{} 不是有效 TOML: {e}", path.display()))
}

fn nested_toml<'a>(root: &'a toml::Value, table: &str, key: &str) -> Option<&'a toml::Value> {
    root.get(table).and_then(|value| value.get(key))
}

fn toml_u64(value: Option<&toml::Value>) -> Option<u64> {
    value
        .and_then(toml::Value::as_integer)
        .and_then(|value| u64::try_from(value).ok())
}

fn ensure_toml_table<'a>(
    root: &'a mut toml::Value,
    name: &str,
) -> Result<&'a mut toml::map::Map<String, toml::Value>, String> {
    let root = root.as_table_mut().ok_or("config.toml 顶层必须是表")?;
    root.entry(name.to_string())
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()))
        .as_table_mut()
        .ok_or_else(|| format!("[{name}] 必须是表"))
}

fn set_optional_integer(
    table: &mut toml::map::Map<String, toml::Value>,
    key: &str,
    value: Option<u64>,
) -> Result<(), String> {
    match value {
        Some(value) => {
            let value = i64::try_from(value).map_err(|_| format!("{key} 超出支持范围"))?;
            table.insert(key.to_string(), toml::Value::Integer(value));
        }
        None => {
            table.remove(key);
        }
    }
    Ok(())
}

fn read_performance_config_from(home: &Path) -> Result<KimiPerformanceConfig, String> {
    let config = read_toml_or_empty(&home.join("config.toml"))?;
    let tui = read_toml_or_empty(&home.join("tui.toml"))?;
    let defaults = KimiPerformanceConfig::default();
    Ok(KimiPerformanceConfig {
        max_steps_per_turn: toml_u64(nested_toml(&config, "loop_control", "max_steps_per_turn")),
        max_attempts_per_step: toml_u64(nested_toml(
            &config,
            "loop_control",
            "max_attempts_per_step",
        ))
        .unwrap_or(defaults.max_attempts_per_step),
        reserved_context_size: toml_u64(nested_toml(
            &config,
            "loop_control",
            "reserved_context_size",
        )),
        max_running_tasks: toml_u64(nested_toml(&config, "background", "max_running_tasks")),
        bash_auto_background_on_timeout: nested_toml(
            &config,
            "background",
            "bash_auto_background_on_timeout",
        )
        .and_then(toml::Value::as_bool)
        .unwrap_or(defaults.bash_auto_background_on_timeout),
        bash_task_timeout_s: toml_u64(nested_toml(&config, "background", "bash_task_timeout_s"))
            .unwrap_or(defaults.bash_task_timeout_s),
        subagent_timeout_ms: toml_u64(nested_toml(&config, "subagent", "timeout_ms"))
            .unwrap_or(defaults.subagent_timeout_ms),
        mcp_startup_timeout_ms: toml_u64(nested_toml(&config, "mcp", "startup_timeout_ms"))
            .unwrap_or(defaults.mcp_startup_timeout_ms),
        mcp_tool_timeout_ms: toml_u64(nested_toml(&config, "mcp", "tool_timeout_ms"))
            .unwrap_or(defaults.mcp_tool_timeout_ms),
        token_counting_strategy: nested_toml(&config, "token_counting", "strategy")
            .and_then(toml::Value::as_str)
            .unwrap_or(&defaults.token_counting_strategy)
            .to_string(),
        image_max_edge_px: toml_u64(nested_toml(&config, "image", "max_edge_px"))
            .unwrap_or(defaults.image_max_edge_px),
        image_read_byte_budget: toml_u64(nested_toml(&config, "image", "read_byte_budget"))
            .unwrap_or(defaults.image_read_byte_budget),
        cache_expiry_hint: tui
            .get("cache_expiry_hint")
            .and_then(toml::Value::as_bool)
            .unwrap_or(defaults.cache_expiry_hint),
    })
}

fn validate_performance_config(value: &KimiPerformanceConfig) -> Result<(), String> {
    let optional_range =
        |name: &str, value: Option<u64>, min: u64, max: u64| -> Result<(), String> {
            if value.is_some_and(|value| value < min || value > max) {
                return Err(format!("{name} 必须在 {min} 到 {max} 之间"));
            }
            Ok(())
        };
    let range = |name: &str, value: u64, min: u64, max: u64| -> Result<(), String> {
        if value < min || value > max {
            return Err(format!("{name} 必须在 {min} 到 {max} 之间"));
        }
        Ok(())
    };
    optional_range("max_steps_per_turn", value.max_steps_per_turn, 1, 10_000)?;
    range("max_attempts_per_step", value.max_attempts_per_step, 1, 100)?;
    optional_range(
        "reserved_context_size",
        value.reserved_context_size,
        1,
        2_000_000,
    )?;
    optional_range("max_running_tasks", value.max_running_tasks, 1, 64)?;
    range("bash_task_timeout_s", value.bash_task_timeout_s, 10, 86_400)?;
    range(
        "subagent_timeout_ms",
        value.subagent_timeout_ms,
        10_000,
        86_400_000,
    )?;
    range(
        "mcp_startup_timeout_ms",
        value.mcp_startup_timeout_ms,
        1_000,
        600_000,
    )?;
    range(
        "mcp_tool_timeout_ms",
        value.mcp_tool_timeout_ms,
        1_000,
        3_600_000,
    )?;
    range("image_max_edge_px", value.image_max_edge_px, 256, 8_192)?;
    range(
        "image_read_byte_budget",
        value.image_read_byte_budget,
        65_536,
        16_777_216,
    )?;
    if !matches!(
        value.token_counting_strategy.as_str(),
        "measured+estimated" | "measured" | "estimated"
    ) {
        return Err(
            "token_counting_strategy 只支持 measured+estimated、measured 或 estimated".to_string(),
        );
    }
    Ok(())
}

fn save_performance_config_to(home: &Path, value: &KimiPerformanceConfig) -> Result<(), String> {
    validate_performance_config(value)?;
    let config_path = home.join("config.toml");
    let tui_path = home.join("tui.toml");
    let mut config = read_toml_or_empty(&config_path)?;
    {
        let table = ensure_toml_table(&mut config, "loop_control")?;
        set_optional_integer(table, "max_steps_per_turn", value.max_steps_per_turn)?;
        set_optional_integer(table, "reserved_context_size", value.reserved_context_size)?;
        table.insert(
            "max_attempts_per_step".into(),
            toml::Value::Integer(value.max_attempts_per_step as i64),
        );
    }
    {
        let table = ensure_toml_table(&mut config, "background")?;
        set_optional_integer(table, "max_running_tasks", value.max_running_tasks)?;
        table.insert(
            "bash_auto_background_on_timeout".into(),
            toml::Value::Boolean(value.bash_auto_background_on_timeout),
        );
        table.insert(
            "bash_task_timeout_s".into(),
            toml::Value::Integer(value.bash_task_timeout_s as i64),
        );
    }
    for (table_name, pairs) in [
        (
            "subagent",
            vec![(
                "timeout_ms",
                toml::Value::Integer(value.subagent_timeout_ms as i64),
            )],
        ),
        (
            "mcp",
            vec![
                (
                    "startup_timeout_ms",
                    toml::Value::Integer(value.mcp_startup_timeout_ms as i64),
                ),
                (
                    "tool_timeout_ms",
                    toml::Value::Integer(value.mcp_tool_timeout_ms as i64),
                ),
            ],
        ),
        (
            "token_counting",
            vec![(
                "strategy",
                toml::Value::String(value.token_counting_strategy.clone()),
            )],
        ),
        (
            "image",
            vec![
                (
                    "max_edge_px",
                    toml::Value::Integer(value.image_max_edge_px as i64),
                ),
                (
                    "read_byte_budget",
                    toml::Value::Integer(value.image_read_byte_budget as i64),
                ),
            ],
        ),
    ] {
        let table = ensure_toml_table(&mut config, table_name)?;
        for (key, item) in pairs {
            table.insert(key.to_string(), item);
        }
    }
    atomic_write(
        &config_path,
        &toml::to_string_pretty(&config).map_err(|e| e.to_string())?,
    )?;
    let mut tui = read_toml_or_empty(&tui_path)?;
    tui.as_table_mut().ok_or("tui.toml 顶层必须是表")?.insert(
        "cache_expiry_hint".into(),
        toml::Value::Boolean(value.cache_expiry_hint),
    );
    atomic_write(
        &tui_path,
        &toml::to_string_pretty(&tui).map_err(|e| e.to_string())?,
    )
}

#[tauri::command]
pub fn read_kimi_performance_config() -> Result<KimiPerformanceConfig, String> {
    read_performance_config_from(&kimi_home())
}

#[tauri::command]
pub fn save_kimi_performance_config(
    value: KimiPerformanceConfig,
) -> Result<KimiPerformanceConfig, String> {
    let home = kimi_home();
    save_performance_config_to(&home, &value)?;
    read_performance_config_from(&home)
}

#[tauri::command]
pub fn save_kimi_agent(
    name: String,
    description: String,
    when_to_use: Option<String>,
    model_preference: Option<String>,
    tools: Vec<String>,
    disallowed_tools: Vec<String>,
    prompt: String,
) -> Result<AgentProfile, String> {
    if !valid_agent_name(&name) {
        return Err("Agent 名称只能使用小写字母、数字和连字符，且首尾必须是字母或数字".to_string());
    }
    if description.trim().is_empty() || prompt.trim().is_empty() {
        return Err("描述和系统提示不能为空".to_string());
    }
    let path = kimi_home().join("agents").join(format!("{name}.md"));
    let q = |value: &str| serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string());
    let mut frontmatter = format!(
        "---\nname: {}\ndescription: {}\n",
        q(&name),
        q(description.trim())
    );
    if let Some(value) = when_to_use
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        frontmatter.push_str(&format!("whenToUse: {}\n", q(value.trim())));
    }
    if let Some(value) = model_preference
        .as_deref()
        .filter(|value| *value == "primary" || *value == "secondary")
    {
        frontmatter.push_str(&format!("model_preference: {}\n", q(value)));
    }
    frontmatter.push_str(&format!(
        "tools: {}\n",
        serde_json::to_string(&tools).map_err(|e| e.to_string())?
    ));
    if !disallowed_tools.is_empty() {
        frontmatter.push_str(&format!(
            "disallowedTools: {}\n",
            serde_json::to_string(&disallowed_tools).map_err(|e| e.to_string())?
        ));
    }
    frontmatter.push_str("---\n\n");
    frontmatter.push_str(prompt.trim());
    frontmatter.push('\n');
    atomic_write(&path, &frontmatter)?;
    parse_agent(&path, "user", true).ok_or("保存后无法读取 Agent".to_string())
}

#[tauri::command]
pub fn delete_kimi_agent(name: String) -> Result<(), String> {
    if !valid_agent_name(&name) {
        return Err("无效 Agent 名称".to_string());
    }
    let path = kimi_home().join("agents").join(format!("{name}.md"));
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_kimi_system_prompt() -> Result<String, String> {
    let path = kimi_home().join("SYSTEM.md");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_kimi_system_prompt(content: String) -> Result<(), String> {
    let path = kimi_home().join("SYSTEM.md");
    if content.trim().is_empty() {
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    atomic_write(&path, content.trim())
}

fn workspace_kimi_path(workspace_root: &str, file: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(workspace_root);
    if !root.is_absolute() || !root.is_dir() {
        return Err("工作区路径无效".to_string());
    }
    Ok(root.join(".kimi-code").join(file))
}

fn mcp_path(scope: &str, workspace_root: Option<&str>) -> Result<PathBuf, String> {
    match scope {
        "user" => Ok(kimi_home().join("mcp.json")),
        "project" => workspace_kimi_path(workspace_root.ok_or("请选择工作区")?, "mcp.json"),
        _ => Err("MCP 作用域必须是 user 或 project".to_string()),
    }
}

fn read_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > 2 * 1024 * 1024 {
        return Err(format!("{} 超过 2 MB，拒绝在 GUI 中编辑", path.display()));
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str::<Value>(&raw)
        .map_err(|e| format!("{} 不是有效 JSON: {e}", path.display()))?
        .as_object()
        .cloned()
        .ok_or_else(|| format!("{} 顶层必须是对象", path.display()))
}

fn mcp_entries(path: &Path, scope: &str) -> Result<Vec<McpConfigEntry>, String> {
    let root = read_json_object(path)?;
    let Some(servers) = root.get("mcpServers").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };
    let mut entries = Vec::new();
    for (name, raw) in servers {
        let Some(server) = raw.as_object() else {
            continue;
        };
        let transport = server
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_else(|| {
                if server.contains_key("command") {
                    "stdio"
                } else {
                    "http"
                }
            })
            .to_string();
        let args = server
            .get("args")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        let sensitive_keys = [
            "env",
            "headers",
            "bearerTokenEnvVar",
            "token",
            "authorization",
        ];
        entries.push(McpConfigEntry {
            name: name.clone(),
            scope: scope.to_string(),
            transport,
            command: server
                .get("command")
                .and_then(Value::as_str)
                .map(str::to_string),
            args,
            url: server
                .get("url")
                .and_then(Value::as_str)
                .map(str::to_string),
            enabled: server
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(true),
            has_sensitive_config: sensitive_keys.iter().any(|key| server.contains_key(*key)),
            path: path.display().to_string(),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
pub fn list_kimi_mcp_config(workspace_root: Option<String>) -> Result<Vec<McpConfigEntry>, String> {
    let mut entries = mcp_entries(&kimi_home().join("mcp.json"), "user")?;
    if let Some(root) = workspace_root.as_deref() {
        entries.extend(mcp_entries(
            &workspace_kimi_path(root, "mcp.json")?,
            "project",
        )?);
    }
    Ok(entries)
}

fn valid_config_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 80
        && !name
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\'))
}

#[tauri::command]
pub fn save_kimi_mcp_server(input: McpConfigInput) -> Result<McpConfigEntry, String> {
    let name = input.name.trim();
    if !valid_config_name(name) {
        return Err("MCP 名称不能为空、不能包含斜杠，且最多 80 个字符".to_string());
    }
    if !matches!(input.transport.as_str(), "stdio" | "http" | "sse") {
        return Err("MCP 传输方式必须是 stdio、http 或 sse".to_string());
    }
    if input.transport == "stdio" && input.command.as_deref().is_none_or(|v| v.trim().is_empty()) {
        return Err("stdio MCP 必须填写命令".to_string());
    }
    if input.transport != "stdio" {
        let url = input.url.as_deref().unwrap_or_default().trim();
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return Err("远程 MCP URL 必须以 http:// 或 https:// 开头".to_string());
        }
    }
    let path = mcp_path(&input.scope, input.workspace_root.as_deref())?;
    let mut root = read_json_object(&path)?;
    let servers = root
        .entry("mcpServers".to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or("mcpServers 必须是对象")?;
    // Preserve fields the GUI deliberately does not expose, such as env,
    // headers, bearerTokenEnvVar and timeout settings.
    let mut server = servers
        .get(name)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    server.insert("enabled".to_string(), Value::Bool(input.enabled));
    if input.transport == "stdio" {
        server.remove("type");
        server.remove("url");
        server.insert(
            "command".to_string(),
            Value::String(input.command.unwrap_or_default().trim().to_string()),
        );
        server.insert(
            "args".to_string(),
            Value::Array(input.args.into_iter().map(Value::String).collect()),
        );
    } else {
        server.remove("command");
        server.remove("args");
        server.insert("type".to_string(), Value::String(input.transport));
        server.insert(
            "url".to_string(),
            Value::String(input.url.unwrap_or_default().trim().to_string()),
        );
    }
    servers.insert(name.to_string(), Value::Object(server));
    let content = serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())?;
    atomic_write(&path, &format!("{content}\n"))?;
    mcp_entries(&path, &input.scope)?
        .into_iter()
        .find(|entry| entry.name == name)
        .ok_or("保存后无法读取 MCP".to_string())
}

#[tauri::command]
pub fn delete_kimi_mcp_server(
    name: String,
    scope: String,
    workspace_root: Option<String>,
) -> Result<(), String> {
    if !valid_config_name(name.trim()) {
        return Err("无效 MCP 名称".to_string());
    }
    let path = mcp_path(&scope, workspace_root.as_deref())?;
    if !path.exists() {
        return Ok(());
    }
    let mut root = read_json_object(&path)?;
    if let Some(servers) = root.get_mut("mcpServers").and_then(Value::as_object_mut) {
        servers.remove(name.trim());
    }
    let content = serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())?;
    atomic_write(&path, &format!("{content}\n"))
}

fn workspace_context_path(workspace_root: &str) -> Result<PathBuf, String> {
    workspace_kimi_path(workspace_root, "local.toml")
}

#[tauri::command]
pub fn read_kimi_workspace_context(
    workspace_root: String,
) -> Result<WorkspaceContextConfig, String> {
    let path = workspace_context_path(&workspace_root)?;
    let value = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        raw.parse::<toml::Value>()
            .map_err(|e| format!("{} 不是有效 TOML: {e}", path.display()))?
    } else {
        toml::Value::Table(toml::map::Map::new())
    };
    let additional_dirs = value
        .get("workspace")
        .and_then(|v| v.get("additional_dir"))
        .and_then(toml::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(toml::Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    Ok(WorkspaceContextConfig {
        path: path.display().to_string(),
        additional_dirs,
    })
}

#[tauri::command]
pub fn save_kimi_workspace_context(
    workspace_root: String,
    additional_dirs: Vec<String>,
) -> Result<WorkspaceContextConfig, String> {
    if additional_dirs.len() > 32 {
        return Err("附加目录最多 32 个".to_string());
    }
    let path = workspace_context_path(&workspace_root)?;
    let mut normalized = Vec::new();
    for dir in additional_dirs {
        let trimmed = dir.trim();
        if trimmed.is_empty() {
            continue;
        }
        let candidate = PathBuf::from(trimmed);
        if !candidate.is_absolute() {
            return Err(format!("附加目录必须是绝对路径: {trimmed}"));
        }
        let value = candidate.display().to_string();
        if !normalized.contains(&value) {
            normalized.push(value);
        }
    }
    let mut value = if path.exists() {
        fs::read_to_string(&path)
            .map_err(|e| e.to_string())?
            .parse::<toml::Value>()
            .map_err(|e| format!("{} 不是有效 TOML: {e}", path.display()))?
    } else {
        toml::Value::Table(toml::map::Map::new())
    };
    let root = value.as_table_mut().ok_or("local.toml 顶层必须是表")?;
    let workspace = root
        .entry("workspace")
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()))
        .as_table_mut()
        .ok_or("[workspace] 必须是表")?;
    workspace.insert(
        "additional_dir".to_string(),
        toml::Value::Array(
            normalized
                .iter()
                .cloned()
                .map(toml::Value::String)
                .collect(),
        ),
    );
    atomic_write(
        &path,
        &toml::to_string_pretty(&value).map_err(|e| e.to_string())?,
    )?;
    Ok(WorkspaceContextConfig {
        path: path.display().to_string(),
        additional_dirs: normalized,
    })
}

fn backup_entry_allowed(path: &Path) -> bool {
    let mut parts = path.components();
    let Some(first) = parts.next().and_then(|part| part.as_os_str().to_str()) else {
        return false;
    };
    match first {
        "config.toml" | "tui.toml" | "SYSTEM.md" | "mcp.json" | "kimi-gui-experiments.json" => {
            parts.next().is_none()
        }
        "agents" | "skills" => {
            path.components().count() > 1
                && !path.components().any(|part| {
                    matches!(
                        part.as_os_str().to_str(),
                        Some(".git" | "__pycache__" | "node_modules")
                    )
                })
        }
        "plugins" => path == Path::new("plugins/installed.json"),
        _ => false,
    }
}

fn collect_backup_files(
    root: &Path,
    relative: &Path,
    depth: usize,
    files: &mut Vec<(PathBuf, PathBuf, u64)>,
    total: &mut u64,
) -> Result<(), String> {
    if depth > 8 || files.len() >= BACKUP_MAX_FILES {
        return Err(format!(
            "备份文件过多或目录层级过深（上限 {BACKUP_MAX_FILES} 个文件）"
        ));
    }
    let absolute = root.join(relative);
    let metadata = match fs::symlink_metadata(&absolute) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    if metadata.file_type().is_symlink() {
        return Ok(());
    }
    if metadata.is_dir() {
        for entry in fs::read_dir(&absolute).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            collect_backup_files(
                root,
                &relative.join(entry.file_name()),
                depth + 1,
                files,
                total,
            )?;
        }
        return Ok(());
    }
    if !metadata.is_file() || !backup_entry_allowed(relative) {
        return Ok(());
    }
    if metadata.len() > BACKUP_MAX_FILE_BYTES {
        return Err(format!("{} 超过单文件 16 MB 限制", relative.display()));
    }
    *total = total.saturating_add(metadata.len());
    if *total > BACKUP_MAX_BYTES {
        return Err("备份内容超过 100 MB 限制".to_string());
    }
    files.push((absolute, relative.to_path_buf(), metadata.len()));
    Ok(())
}

fn backup_sources(root: &Path) -> Result<Vec<(PathBuf, PathBuf, u64)>, String> {
    let mut files = Vec::new();
    let mut total = 0;
    for relative in [
        "config.toml",
        "tui.toml",
        "SYSTEM.md",
        "mcp.json",
        "kimi-gui-experiments.json",
        "plugins/installed.json",
        "agents",
        "skills",
    ] {
        collect_backup_files(root, Path::new(relative), 0, &mut files, &mut total)?;
    }
    files.sort_by(|a, b| a.1.cmp(&b.1));
    Ok(files)
}

fn zip_entry_name(path: &Path) -> String {
    path.components()
        .filter_map(|part| part.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/")
}

fn write_backup_zip(destination: &Path, files: &[(PathBuf, PathBuf, u64)]) -> Result<(), String> {
    let parent = destination.parent().ok_or("备份目标路径无效")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!(
        ".{}.tmp-{}",
        destination
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
        std::process::id()
    ));
    let file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let result = (|| -> Result<(), String> {
        for (absolute, relative, _) in files {
            archive
                .start_file(zip_entry_name(relative), options)
                .map_err(|e| e.to_string())?;
            let mut source = fs::File::open(absolute).map_err(|e| e.to_string())?;
            std::io::copy(&mut source, &mut archive).map_err(|e| e.to_string())?;
        }
        archive.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
        return result;
    }
    if destination.exists() {
        fs::remove_file(destination).map_err(|e| e.to_string())?;
    }
    fs::rename(&temporary, destination).map_err(|e| e.to_string())
}

fn validate_backup_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("备份路径必须是绝对路径".to_string());
    }
    if path.extension().and_then(|value| value.to_str()) != Some("zip") {
        return Err("备份文件必须使用 .zip 扩展名".to_string());
    }
    Ok(())
}

fn inspect_backup_archive(path: &Path) -> Result<KimiBackupInfo, String> {
    validate_backup_path(path)?;
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无法读取 ZIP: {e}"))?;
    if archive.len() > BACKUP_MAX_FILES {
        return Err(format!("备份文件数超过 {BACKUP_MAX_FILES} 个"));
    }
    let mut entries = Vec::new();
    let mut bytes = 0_u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| format!("ZIP 包含不安全路径: {}", entry.name()))?;
        if !backup_entry_allowed(&relative) {
            return Err(format!("ZIP 包含不允许恢复的路径: {}", entry.name()));
        }
        if entry.size() > BACKUP_MAX_FILE_BYTES {
            return Err(format!("{} 超过单文件 16 MB 限制", entry.name()));
        }
        bytes = bytes.saturating_add(entry.size());
        if bytes > BACKUP_MAX_BYTES {
            return Err("备份解压后超过 100 MB 限制".to_string());
        }
        let name = zip_entry_name(&relative);
        if entries.contains(&name) {
            return Err(format!("ZIP 包含重复路径: {name}"));
        }
        entries.push(name);
    }
    if entries.is_empty() {
        return Err("备份中没有可恢复的 Kimi 配置".to_string());
    }
    Ok(KimiBackupInfo {
        path: path.display().to_string(),
        files: entries.len(),
        bytes,
        entries,
        safety_snapshot_path: None,
    })
}

#[tauri::command]
pub async fn create_kimi_settings_backup(destination: String) -> Result<KimiBackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let destination = PathBuf::from(destination);
        validate_backup_path(&destination)?;
        let files = backup_sources(&kimi_home())?;
        if files.is_empty() {
            return Err("没有找到可备份的 Kimi 配置、Agents 或 Skills".to_string());
        }
        write_backup_zip(&destination, &files)?;
        Ok(KimiBackupInfo {
            path: destination.display().to_string(),
            files: files.len(),
            bytes: files.iter().map(|entry| entry.2).sum(),
            entries: files.iter().map(|entry| zip_entry_name(&entry.1)).collect(),
            safety_snapshot_path: None,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn inspect_kimi_settings_backup(path: String) -> Result<KimiBackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_backup_archive(&PathBuf::from(path)))
        .await
        .map_err(|e| e.to_string())?
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn restore_kimi_settings_backup(path: String) -> Result<KimiBackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let mut info = inspect_backup_archive(&path)?;
        let home = kimi_home();
        let safety = home.join("backups").join(format!(
            "pre-restore-{}-{}",
            timestamp(),
            std::process::id()
        ));
        fs::create_dir_all(&safety).map_err(|e| e.to_string())?;
        let current = backup_sources(&home)?;
        for (absolute, relative, _) in &current {
            let destination = safety.join(relative);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(absolute, destination).map_err(|e| e.to_string())?;
        }

        let file = fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
            if entry.is_dir() {
                continue;
            }
            let relative = entry.enclosed_name().ok_or("备份包含不安全路径")?;
            let destination = home.join(&relative);
            let parent = destination.parent().ok_or("恢复目标路径无效")?;
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            let temporary = parent.join(format!(
                ".{}.restore-{}",
                destination
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy(),
                std::process::id()
            ));
            let mut output = fs::File::create(&temporary).map_err(|e| e.to_string())?;
            let mut remaining = entry.size();
            let mut buffer = [0_u8; 64 * 1024];
            while remaining > 0 {
                let limit =
                    usize::try_from(remaining.min(buffer.len() as u64)).unwrap_or(buffer.len());
                let read = entry
                    .read(&mut buffer[..limit])
                    .map_err(|e| e.to_string())?;
                if read == 0 {
                    break;
                }
                output
                    .write_all(&buffer[..read])
                    .map_err(|e| e.to_string())?;
                remaining -= read as u64;
            }
            if remaining != 0 {
                drop(output);
                let _ = fs::remove_file(&temporary);
                return Err(format!("{} 在恢复时提前结束", entry.name()));
            }
            output.sync_all().map_err(|e| e.to_string())?;
            if destination.exists() {
                fs::remove_file(&destination).map_err(|e| e.to_string())?;
            }
            fs::rename(&temporary, &destination).map_err(|e| e.to_string())?;
        }
        info.safety_snapshot_path = Some(safety.display().to_string());
        Ok(info)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_kimi_maintenance(
    action: String,
    session_id: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let kimi = find_kimi().ok_or("找不到 kimi CLI")?;
        let mut command = Command::new(kimi);
        match action.as_str() {
            "doctor-config" => {
                command.args(["doctor", "config"]);
            }
            "doctor-tui" => {
                command.args(["doctor", "tui"]);
            }
            "migrate" => {
                command.arg("migrate");
            }
            "update" => {
                command.arg("update");
            }
            "visualizer" => {
                command.arg("vis");
                if let Some(id) = session_id.as_deref().filter(|id| !id.is_empty()) {
                    command.arg(id);
                }
            }
            _ => return Err("不支持的维护操作".to_string()),
        }
        command.current_dir(kimi_home());
        command_text(command)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        backup_entry_allowed, cleanup_orphan_session_in_home, delete_archived_session_in_home,
        detect_orphan_sessions_in_home, migrate_loop_control_config, read_performance_config_from,
        rename_loop_control_key, save_performance_config_to, valid_http_url, valid_provider_id,
        validate_performance_config, KimiPerformanceConfig,
    };
    use std::{fs, path::Path, time::SystemTime};

    fn temp_kimi_home(label: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("kimi-gui-{label}-{}-{nonce}", std::process::id()))
    }

    #[test]
    fn backup_allowlist_rejects_credentials_and_traversal() {
        assert!(backup_entry_allowed(Path::new("config.toml")));
        assert!(backup_entry_allowed(Path::new("agents/reviewer.md")));
        assert!(backup_entry_allowed(Path::new("skills/local/SKILL.md")));
        assert!(backup_entry_allowed(Path::new("plugins/installed.json")));
        assert!(!backup_entry_allowed(Path::new("auth.json")));
        assert!(!backup_entry_allowed(Path::new("sessions/session.json")));
        assert!(!backup_entry_allowed(Path::new("../config.toml")));
        assert!(!backup_entry_allowed(Path::new("plugins/cache/token.json")));
    }

    #[test]
    fn provider_command_inputs_reject_option_injection() {
        assert!(valid_provider_id("google-vertex-anthropic"));
        assert!(!valid_provider_id("--help"));
        assert!(valid_http_url("https://models.dev/api.json"));
        assert!(!valid_http_url("file:///tmp/api.json"));
        assert!(!valid_http_url("https://example.test/api.json\n--help"));
    }

    #[test]
    fn loop_control_migration_only_renames_exact_keys() {
        assert_eq!(
            rename_loop_control_key(
                "  max_retries_per_step = 3 # keep",
                "max_retries_per_step",
                "max_attempts_per_step"
            ),
            Some("  max_attempts_per_step = 3 # keep".to_string())
        );
        assert_eq!(
            rename_loop_control_key(
                "max_retries_per_step_extra = 3",
                "max_retries_per_step",
                "max_attempts_per_step"
            ),
            None
        );
    }

    #[test]
    fn loop_control_migration_keeps_new_value_when_both_keys_exist() {
        let input = "[loop_control]\nmax_retries_per_step = 3\nmax_attempts_per_step = 8\nmax_steps_per_run = 12\n";
        let (output, changes) = migrate_loop_control_config(input);

        assert!(output.contains("# deprecated by Kimi Code 0.33: max_retries_per_step = 3"));
        assert!(output.contains("max_attempts_per_step = 8"));
        assert!(output.contains("max_steps_per_turn = 12"));
        assert_eq!(changes.len(), 2);
    }

    #[test]
    fn orphan_cleanup_moves_history_to_recoverable_backup() {
        let home = temp_kimi_home("orphan-cleanup");
        let session_id = "session_863315c6-fe67-438e-ba49-9a8bbfa2dadf";
        let session_dir = home.join("sessions/wd-missing").join(session_id);
        fs::create_dir_all(&session_dir).expect("create session");
        fs::write(session_dir.join("state.json"), "{\"title\":\"reply OK\"}").expect("write state");
        let missing_work_dir = home.join("worktree-that-no-longer-exists");
        let index = serde_json::json!({
            "sessionId": session_id,
            "sessionDir": session_dir,
            "workDir": missing_work_dir,
        });
        fs::write(home.join("session_index.jsonl"), format!("{index}\n")).expect("write index");

        let result =
            cleanup_orphan_session_in_home(&home, session_id, true).expect("cleanup orphan");
        let backup = result.backup_path.expect("backup path");
        assert!(!session_dir.exists());
        assert!(Path::new(&backup).join("state.json").exists());
        assert!(!result.already_cleaned);

        fs::remove_dir_all(&home).expect("remove isolated test home");
    }

    #[test]
    fn orphan_cleanup_refuses_a_live_workspace() {
        let home = temp_kimi_home("live-session");
        let session_id = "session_live-123";
        let session_dir = home.join("sessions/wd-live").join(session_id);
        let work_dir = home.join("live-worktree");
        fs::create_dir_all(&session_dir).expect("create session");
        fs::create_dir_all(&work_dir).expect("create worktree");
        let index = serde_json::json!({
            "sessionId": session_id,
            "sessionDir": session_dir,
            "workDir": work_dir,
        });
        fs::write(home.join("session_index.jsonl"), format!("{index}\n")).expect("write index");

        let error =
            cleanup_orphan_session_in_home(&home, session_id, false).expect_err("must refuse");
        assert!(error.contains("工作区仍然存在"));
        assert!(session_dir.exists());

        fs::remove_dir_all(&home).expect("remove isolated test home");
    }

    #[test]
    fn orphan_cleanup_can_permanently_remove_without_backup() {
        let home = temp_kimi_home("orphan-delete");
        let session_id = "session_delete-123";
        let session_dir = home.join("sessions/wd-missing").join(session_id);
        fs::create_dir_all(&session_dir).expect("create session");
        fs::write(session_dir.join("state.json"), "{}").expect("write state");
        let index = serde_json::json!({
            "sessionId": session_id,
            "sessionDir": session_dir,
            "workDir": home.join("missing-worktree"),
        });
        fs::write(home.join("session_index.jsonl"), format!("{index}\n")).expect("write index");

        let result = cleanup_orphan_session_in_home(&home, session_id, false)
            .expect("delete orphan without backup");
        assert!(!session_dir.exists());
        assert!(result.backup_path.is_none());
        assert!(!home.join("orphaned-sessions").exists());

        fs::remove_dir_all(&home).expect("remove isolated test home");
    }

    #[test]
    fn orphan_detection_reports_only_missing_workspaces_and_totals_bytes() {
        let home = temp_kimi_home("orphan-detect");
        let orphan_id = "session_orphan-123";
        let live_id = "session_live-456";
        let orphan_dir = home.join("sessions/wd-orphan").join(orphan_id);
        let live_dir = home.join("sessions/wd-live").join(live_id);
        let live_worktree = home.join("live-worktree");
        fs::create_dir_all(&orphan_dir).expect("create orphan session");
        fs::create_dir_all(&live_dir).expect("create live session");
        fs::create_dir_all(&live_worktree).expect("create live worktree");
        fs::write(orphan_dir.join("state.json"), "{\"title\":\"Lost task\"}")
            .expect("write orphan state");
        fs::write(orphan_dir.join("wire.jsonl"), "12345").expect("write orphan history");
        fs::write(live_dir.join("state.json"), "{}").expect("write live state");
        let entries = [
            serde_json::json!({
                "sessionId": orphan_id,
                "sessionDir": orphan_dir,
                "workDir": home.join("missing-worktree"),
            }),
            serde_json::json!({
                "sessionId": live_id,
                "sessionDir": live_dir,
                "workDir": live_worktree,
            }),
        ];
        fs::write(
            home.join("session_index.jsonl"),
            entries.map(|entry| entry.to_string()).join("\n") + "\n",
        )
        .expect("write index");

        let result = detect_orphan_sessions_in_home(&home).expect("detect orphans");
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].session_id, orphan_id);
        assert_eq!(result.items[0].title, "Lost task");
        assert!(result.total_bytes >= 5);

        fs::remove_dir_all(&home).expect("remove isolated test home");
    }

    #[test]
    fn permanent_delete_requires_an_archived_session() {
        let home = temp_kimi_home("delete-archived");
        let sessions = home.join("sessions");
        let archived_id = "session_archived-safe";
        let active_id = "session_active-safe";
        let archived_dir = sessions.join(archived_id);
        let active_dir = sessions.join(active_id);
        fs::create_dir_all(&archived_dir).expect("create archived dir");
        fs::create_dir_all(&active_dir).expect("create active dir");
        fs::write(archived_dir.join("state.json"), r#"{"archived":true}"#)
            .expect("write archived state");
        fs::write(active_dir.join("state.json"), r#"{"archived":false}"#)
            .expect("write active state");
        let entries = [
            serde_json::json!({
                "sessionId": archived_id,
                "sessionDir": archived_dir,
                "workDir": home.join("project-a"),
            }),
            serde_json::json!({
                "sessionId": active_id,
                "sessionDir": active_dir,
                "workDir": home.join("project-b"),
            }),
        ];
        fs::write(
            home.join("session_index.jsonl"),
            entries.map(|entry| entry.to_string()).join("\n") + "\n",
        )
        .expect("write index");

        let deleted =
            delete_archived_session_in_home(&home, archived_id).expect("delete archived session");
        assert!(!deleted.already_deleted);
        assert!(!sessions.join(archived_id).exists());
        let error = delete_archived_session_in_home(&home, active_id)
            .expect_err("active session must be refused");
        assert!(error.contains("尚未归档"));
        assert!(sessions.join(active_id).exists());

        fs::remove_dir_all(&home).expect("remove isolated test home");
    }

    #[test]
    fn performance_config_round_trips_and_preserves_unrelated_fields() {
        let home = temp_kimi_home("performance-config");
        fs::create_dir_all(&home).expect("create home");
        fs::write(
            home.join("config.toml"),
            "unrelated = \"keep\"\n[background]\ncustom = 7\n",
        )
        .expect("write config");
        let value = KimiPerformanceConfig {
            max_steps_per_turn: Some(42),
            max_running_tasks: Some(6),
            cache_expiry_hint: false,
            ..KimiPerformanceConfig::default()
        };
        save_performance_config_to(&home, &value).expect("save performance config");
        assert_eq!(
            read_performance_config_from(&home).expect("read performance config"),
            value
        );
        let raw = fs::read_to_string(home.join("config.toml")).expect("read raw config");
        assert!(raw.contains("unrelated = \"keep\""));
        assert!(raw.contains("custom = 7"));
        fs::remove_dir_all(&home).expect("remove isolated test home");
    }

    #[test]
    fn performance_config_rejects_unsafe_limits() {
        let value = KimiPerformanceConfig {
            max_running_tasks: Some(0),
            ..KimiPerformanceConfig::default()
        };
        assert!(validate_performance_config(&value)
            .expect_err("must reject")
            .contains("max_running_tasks"));
    }
}
