/**
 * useTheme —— 浅色/深色主题切换
 *
 * 状态:localStorage('kimi-theme')持久化,默认跟随系统(prefers-color-scheme)。
 * 切换时在 documentElement 上设 data-theme 属性 → tokens.css 的
 * `[data-theme="dark"]` 块自动生效(ARCHITECTURE 5.1)。
 *
 * 注意:**这个 composable 必须被某个入口(main.ts 或 App.vue)import 一次**,
 * 否则模块不会加载,启动时的 `apply(theme.value)` 不会执行,data-theme 不会设。
 * 轮次 3 wire-up 时会在 main.ts 显式 import。轮次 2 阶段 kimi3 用 mock,
 * 可以暂时不依赖这个。
 */
import { ref } from 'vue';

type Theme = 'light' | 'dark';

function detectInitial(): Theme {
  const saved = localStorage.getItem('kimi-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

const theme = ref<Theme>(detectInitial());

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('kimi-theme', t);
}

// 模块级 set 函数(避免对象方法里的 `this`,支持解构)
function setImpl(t: Theme) {
  theme.value = t;
  apply(t);
}
function toggleImpl() {
  setImpl(theme.value === 'light' ? 'dark' : 'light');
}

// 启动时同步一次(模块加载即生效)
if (typeof document !== 'undefined') apply(theme.value);

export function useTheme() {
  return {
    theme,
    set: setImpl,
    toggle: toggleImpl,
  };
}
