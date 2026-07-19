/**
 * codex 组件验收沙箱入口(web/codex.html → /src/codex-demo/main.ts)
 * 样式全量挂载:web/src/styles/ 10 文件(prototype v2 原样搬运)。
 *
 * 轮次 3 阶段 B 升级:
 * - 显式 import useTheme,触发模块级 apply(设 data-theme)
 * - 在 Tauri 桌面环境挂载后调 useTauriDaemon.fetch(),拿真 daemon base+token
 *   (浏览器开发测试环境会返回 'no-tauri',沙箱继续用 mock 数据)
 */
import { createApp } from 'vue';
import i18n from '../i18n';
import DemoApp from './DemoApp.vue';
import '../composables/codex/useTheme'; // 触发模块级 apply(data-theme)
import { useTauriDaemon } from '../composables/codex/useTauriDaemon';

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

const app = createApp(DemoApp);
// i18n 必须装:官方 chat/Markdown.vue 内部 useI18n(),不装会抛
// "Need to install with `app.use` function"(GLM 轮次 4 换官方 Markdown 后沙箱挂掉的根因)
app.use(i18n);
app.mount('#app');

// 挂载后异步拉 daemon 信息(Tauri 环境生效;浏览器环境静默 no-tauri)
const tauri = useTauriDaemon();
tauri
  .fetch()
  .then((info) => {
    if (info) {
      // 真连 daemon 成功 —— 后续阶段 C 会把 info 注入到 useKimiWebClient
      // 现阶段仅 console.info 验证 wire-up 通,**不打印 token**
      // eslint-disable-next-line no-console
      console.info('[codex-demo] daemon wire-up OK, base =', info.base);
      // 调试用:挂到 window(不暴露 token)
      if (typeof window !== 'undefined') {
        (window as unknown as { __daemonBase?: string }).__daemonBase = info.base;
      }
    } else {
      // eslint-disable-next-line no-console
      console.info('[codex-demo] no daemon wire-up:', tauri.error.value);
    }
  })
  .catch(() => {
    /* 静默:浏览器环境/daemon 未启动都正常 */
  });
