//! 全局快捷键(系统级,应用未聚焦也响应)
//!
//! 当前注册:`Cmd+Option+N` 唤起主窗口(聚焦 + 显示)
//! 后续可扩展:截屏发 agent(Appshots,ARCHITECTURE P2)等。
//!
//! 注:全局快捷键是稀缺资源,只注册高频入口。其他快捷键(⌘B/⌘I/y/a/n/p)
//! 是**应用内**的,在 webview 里由 useHotkeys 处理,不在这里。

use tauri::Manager;
use tauri_plugin_global_shortcut::{Builder, Shortcut, ShortcutState};

/// 构造 global-shortcut plugin(在 lib.rs 的 `.plugin()` 注册)。
///
/// 返回类型用 `impl tauri::Plugin<tauri::Wry>` 隐藏具体 TauriPlugin 类型(它是私有的)。
///
/// 失败场景:Cmd+Option+N 已被其他应用占用 → 退化为无快捷键的空 plugin
/// (全局快捷键是 nice-to-have,不是核心功能,不阻断启动)。
pub fn build_global_shortcut_plugin() -> impl tauri::plugin::Plugin<tauri::Wry> {
    let handler = move |app: &tauri::AppHandle,
                        _shortcut: &Shortcut,
                        event: tauri_plugin_global_shortcut::ShortcutEvent| {
        if event.state == ShortcutState::Pressed {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    };

    // 先尝试注册 Cmd+Option+N。失败时不阻断启动(全局快捷键非核心功能),
    // 退化为只装 handler、不注册快捷键的 plugin —— handler 不会触发。
    match "Cmd+Option+N".parse::<Shortcut>() {
        Ok(sc) => match Builder::new().with_handler(handler).with_shortcut(sc) {
            Ok(b) => b.build(),
            Err(e) => {
                eprintln!("[kimi-gui] 注册 Cmd+Option+N 失败(可能被占用): {e}");
                // 失败时 handler 已被 with_handler 消费到 builder 里再被 with_shortcut 消费,
                // 重建空 plugin(handler 不会触发,但保持 plugin 类型一致)
                Builder::new().build()
            }
        },
        Err(e) => {
            eprintln!("[kimi-gui] 解析快捷键字符串失败: {e}");
            Builder::new().with_handler(handler).build()
        }
    }
}
