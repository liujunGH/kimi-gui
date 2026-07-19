/**
 * codex-app 入口 —— 真产品入口(web/app.html → /src/codex-app/main.ts)
 *
 * 与 codex-demo/main.ts 区别:
 * - codex-demo:挂 DemoApp(mock 数据,7 场景)
 * - codex-app:挂 CodexApp(真 useKimiWebClient 数据,单场景)
 */
import { createApp } from 'vue';
import CodexApp from './CodexApp.vue';
import i18n from '../i18n';
import { installClientErrorCapture } from '../debug/trace';
import { setCredential, initServerAuth } from '../api/daemon/serverAuth';
import '../composables/codex/useTheme'; // 触发模块级 data-theme apply
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '../style.css';

import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/sidebar.css';
import '../styles/conversation.css';
import '../styles/thinking.css';
import '../styles/composer.css';
import '../styles/approval.css';
import '../styles/diff.css';
import '../styles/detail.css';
import '../styles/settings.css';

installClientErrorCapture();

/**
 * Tauri 环境下:启动时从 Rust 端拿 daemon token,注入到 serverAuth。
 * 跟 web/src/main.ts 的 bootstrapTauriToken 一样(两份入口共用逻辑)。
 */
async function bootstrapTauriToken(): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
  const { invoke } = await import('@tauri-apps/api/core');
  for (let i = 0; i < 10; i++) {
    try {
      const info = await invoke<{ base: string; token: string }>('daemon_info');
      if (info?.token) {
        setCredential(info.token);
        return;
      }
    } catch {
      // daemon 未连接,等 500ms 重试
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

bootstrapTauriToken().finally(() => {
  // 初始化 serverAuth(读 fragment 或 localStorage)
  // bootstrapTauriToken 已经通过 setCredential 写了 localStorage,
  // initServerAuth 会读到它;浏览器环境无 fragment 也能 fallback
  initServerAuth();
  createApp(CodexApp).use(i18n).mount('#app');
});
