//! Native Kimi runtime integration used by Settings.
//!
//! Keep the command surface intentionally narrow: the webview cannot execute
//! arbitrary programs or read arbitrary files. Every path is resolved under a
//! documented Kimi directory (or the selected workspace's agent directories),
//! and maintenance actions are selected from a fixed allow-list.

use std::{
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
        "config.toml" | "tui.toml" | "SYSTEM.md" | "mcp.json" => parts.next().is_none(),
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
    use super::backup_entry_allowed;
    use std::path::Path;

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
}
