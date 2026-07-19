//! macOS Dock badge(未读通知计数)
//!
//! 复用 kimi-ui 的实现。Tauri 2.11 无跨平台 badge API,所以 macOS 走 AppKit,
//! 非 macOS 空实现(Windows taskbar overlay / Linux launcher badge 后续补)。
//!
//! 暴露为 Tauri 命令 `set_dock_badge(count)`,前端 invoke 调用。

#[cfg(target_os = "macos")]
fn set_dock_badge_impl(app: &tauri::AppHandle, count: u32) {
    let _ = app.run_on_main_thread(move || {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSApplication;
        use objc2_foundation::NSString;

        let Some(mtm) = MainThreadMarker::new() else { return };
        let tile = NSApplication::sharedApplication(mtm).dockTile();
        if count == 0 {
            tile.setBadgeLabel(None);
        } else {
            tile.setBadgeLabel(Some(&NSString::from_str(&count.to_string())));
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn set_dock_badge_impl(_app: &tauri::AppHandle, _count: u32) {}

/// 前端 invoke('set_dock_badge', { count }) 设置未读数。
/// count=0 清除 badge。
#[tauri::command]
pub fn set_dock_badge(app: tauri::AppHandle, count: u32) -> Result<(), String> {
    set_dock_badge_impl(&app, count);
    Ok(())
}
