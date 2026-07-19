import { createApp } from 'vue';
import App from './App.vue';
import i18n from './i18n';
import { installClientErrorCapture } from './debug/trace';
import { setCredential } from './api/daemon/serverAuth';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './style.css';

// Always retain bounded metadata for uncaught failures. With ?debug=1 / the
// debug flag, console output is included too; HMR restores listeners/wrappers.
installClientErrorCapture();

/**
 * Tauri 环境下:启动时从 Rust 端拿 daemon token,注入到 serverAuth,
 * 免去用户手输(官方 web 的 ServerAuthDialog)。
 *
 * kimi-ui 的做法是把 token 放 URL hash(#token=xxx),这里走 invoke 更直接。
 * 浏览器环境(开发测试)无 Tauri,跳过 —— 用户走官方的 fragment / 手输流程。
 *
 * Rust 端 daemon 连接是异步的(thread::spawn),前端启动时可能还没拿到,
 * 所以最多重试 10 次(每次 500ms,共 5 秒)。
 */
async function bootstrapTauriToken(): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
  const { invoke } = await import('@tauri-apps/api/core');
  for (let i = 0; i < 10; i++) {
    try {
      const info = await invoke<{ base: string; token: string }>('daemon_info');
      if (info?.token) {
        setCredential(info.token);
        // eslint-disable-next-line no-console
        console.info('[kimi-gui] daemon token 注入成功,base =', info.base);
        return;
      }
    } catch {
      // daemon 未连接,等 500ms 重试
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // eslint-disable-next-line no-console
  console.warn('[kimi-gui] daemon 5 秒内未连接,走官方 ServerAuthDialog 兜底');
}

// 先注入 token,再挂载 App(避免 App 挂载后立即触发 401 弹窗)
bootstrapTauriToken().finally(() => {
  createApp(App).use(i18n).mount('#app');
});
