//! 系统托盘
//!
//! 职责:托盘图标(显示/聚焦主窗 / 退出);点击托盘图标恢复主窗。
//! 关窗隐藏到托盘的逻辑在 lib.rs 的 on_window_event 里。
//!
//! 注:Tauri 2 的 tray API 用 `TrayIconBuilder`,菜单用 `tauri::menu::Menu`。
//! 托盘图标先用内置 icon(图标资产在 src-tauri/icons/)。

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

/// 装配系统托盘。在 setup 钩子里调一次。
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示 Kimi Code", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().expect("缺默认 icon"))
        .menu(&menu)
        .tooltip("Kimi Code")
        // 右键弹菜单(显示/退出),左键交给我们自己的事件显示主窗(Windows 惯例)
        .menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 只响应左键单击显示主窗;右键交给系统弹菜单。
            // 关键:右键若也触发 window.show(),窗口抢焦会把刚弹出的菜单瞬间挤掉
            // (Windows 上表现为"菜单闪一下就没了")
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}
