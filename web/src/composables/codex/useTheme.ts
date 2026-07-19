/**
 * useTheme —— 浅色/深色/跟随系统 主题切换
 *
 * 状态:localStorage('kimi-theme')持久化,默认 'system'(跟随系统偏好)。
 * - 'system':监听 prefers-color-scheme,系统切换时自动跟随
 * - 'light' / 'dark':用户显式选,覆盖系统
 *
 * 切换时在 documentElement 上设 data-theme 属性 → tokens.css 的
 * `[data-theme="dark"]` 块自动生效(ARCHITECTURE 5.1)。
 *
 * 注意:**这个 composable 必须被某个入口(main.ts 或 App.vue)import 一次**,
 * 否则模块不会加载,启动时的 `apply(theme.value)` 不会执行,data-theme 不会设。
 * 轮次 3 wire-up 时会在 main.ts 显式 import。
 *
 * 轮次 3 修正(原 useTheme 只有 light/dark,kimi3 报的契约缺欠):
 * 加 'system' 档 + 系统偏好监听器(additive,不破坏 light/dark 行为)。
 */
import { ref } from 'vue';

export type Theme = 'light' | 'dark' | 'system';

function detectSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function detectInitial(): Theme {
  const saved = localStorage.getItem('kimi-theme');
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

const theme = ref<Theme>(detectInitial());

/** 解析当前应生效的实色(系统档 → 跟随系统) */
function resolved(t: Theme): 'light' | 'dark' {
  return t === 'system' ? detectSystemPref() : t;
}

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', resolved(t));
  localStorage.setItem('kimi-theme', t);
}

// 模块级 set 函数(避免对象方法里的 `this`,支持解构)
function setImpl(t: Theme) {
  theme.value = t;
  apply(t);
}

function toggleImpl() {
  // toggle 在 light/dark 之间切,不进 system(系统档只在设置页选)
  setImpl(resolved(theme.value) === 'light' ? 'dark' : 'light');
}

// 启动时同步一次(模块加载即生效)
if (typeof document !== 'undefined') apply(theme.value);

// 系统偏好变化时,如果当前是 system 档,重新 apply
if (typeof window !== 'undefined' && window.matchMedia) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (theme.value === 'system') apply('system');
  };
  // addEventListener 在老 Safari 不可用,fallback addListener
  if (mql.addEventListener) {
    mql.addEventListener('change', onChange);
  } else if ((mql as unknown as { addListener?: (cb: () => void) => void }).addListener) {
    (mql as unknown as { addListener: (cb: () => void) => void }).addListener(onChange);
  }
}

export function useTheme() {
  return {
    theme,
    /** 当前实际生效的色档(系统档时返回解析后的 light/dark) */
    resolvedTheme: () => resolved(theme.value),
    set: setImpl,
    toggle: toggleImpl,
  };
}
