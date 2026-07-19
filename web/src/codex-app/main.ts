/**
 * codex-app 入口 —— 真产品入口(web/app.html → /src/codex-app/main.ts)
 *
 * Tauri 环境下 token 注入:
 * Rust setup 异步连接 daemon → eval JS 写 localStorage('kimi-web.server-credential')。
 * 前端不依赖 Tauri IPC(__TAURI_INTERNALS__ 在 dev 外部 URL 不注入),
 * 而是轮询 localStorage 等 Rust eval 写入,最多等 10 秒。
 *
 * 浏览器环境(开发测试)无 token,走官方 fragment / 手输流程。
 */
import { createApp } from 'vue';
import CodexApp from './CodexApp.vue';
import i18n from '../i18n';
import { installClientErrorCapture } from '../debug/trace';
import { initServerAuth } from '../api/daemon/serverAuth';
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

/**
 * 等 token 到位再 mount。
 *
 * Tauri 环境:Rust eval 异步写 localStorage,轮询等它。
 * 浏览器环境:localStorage 无 token,等 3 秒后放弃(走官方 ServerAuthDialog)。
 */
function hasCredential(): boolean {
  try {
    return !!localStorage.getItem('kimi-web.server-credential');
  } catch {
    return false;
  }
}

async function waitForCredential(maxWait = 10000, interval = 200): Promise<boolean> {
  if (hasCredential()) return true;
  for (let elapsed = 0; elapsed < maxWait; elapsed += interval) {
    await new Promise((r) => setTimeout(r, interval));
    if (hasCredential()) return true;
  }
  return false;
}

waitForCredential().then((ok) => {
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn('[codex-app] 10 秒内未检测到 daemon token,走官方 ServerAuthDialog');
  }
  initServerAuth();
  createApp(CodexApp).use(i18n).mount('#app');
});
