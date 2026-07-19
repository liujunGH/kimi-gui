/**
 * codex 组件验收沙箱入口(web/codex.html → /src/codex-demo/main.ts)
 * 样式全量挂载:web/src/styles/ 10 文件(prototype v2 原样搬运)。
 */
import { createApp } from 'vue';
import DemoApp from './DemoApp.vue';

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

createApp(DemoApp).mount('#app');
