/**
 * codex-app 入口 —— 真产品入口(web/app.html → /src/codex-app/main.ts)
 *
 * 先同步初始化浏览器凭证并立即挂载 UI。Tauri 环境的 daemon 连接由
 * CodexApp 在 shell 已可见后通过 IPC 完成，避免冷启动出现十秒空白页。
 */
import { createApp } from 'vue';
import CodexApp from './CodexApp.vue';
import i18n from '../i18n';
import { installClientErrorCapture } from '../debug/trace';
import { initServerAuth } from '../api/daemon/serverAuth';
import { setEphemeralCredential } from '../api/daemon/serverAuth';
import '../composables/codex/useTheme';
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

if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  // Migrate away from older desktop builds that persisted the daemon bearer.
  localStorage.removeItem('kimi-web.server-credential');
}
initServerAuth();

async function bootstrapDesktopDaemon(): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
  localStorage.removeItem('kimi-gui.daemon-base');
  const root = document.querySelector<HTMLElement>('#app');
  if (root) {
    root.innerHTML = '<main class="boot-status" role="status"><strong>Kimi Code</strong><span>正在连接本地服务…</span></main>';
  }
  const { invoke } = await import('@tauri-apps/api/core');
  for (let i = 0; i < 40; i++) {
    try {
      const info = await invoke<{ base: string; token: string }>('daemon_info');
      if (info?.token) {
        setEphemeralCredential(info.token);
        // Base URL is not secret and must be available before the API client is created.
        localStorage.setItem('kimi-gui.daemon-base', info.base);
        return;
      }
    } catch {
      // daemon is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

bootstrapDesktopDaemon()
  .catch((error) => console.warn('[codex-app] daemon preflight failed', error))
  .finally(() => {
    createApp(CodexApp).use(i18n).mount('#app');
  });
