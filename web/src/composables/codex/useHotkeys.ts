/**
 * useHotkeys —— 全局快捷键注册表
 *
 * 职责边界(HANDOFF 轮次 0.1):
 * - ZCode 维护**注册表**(keymap → handler)
 * - kimi3 写**组件级 handler**(键盘导航、y/a/n/p 审批、命令面板触发等)
 *   并通过 `register` 注册进来
 * - useHotkeys 在 window 上挂单个 keydown 监听,按 keymap 分发
 *
 * ⚠️ 冻结点:register/unregister 签名一旦 kimi3 开始用,改动需双方同意。
 *
 * 快捷键清单(prototype v2 实现):
 *   ⌘K        搜索(展示)
 *   ⌘B        Review pane
 *   ⌘I        Inspect(Detail pane)
 *   ⌥⌘S       侧边任务
 *   Esc       分层关闭(优先调 useUIState.escClose)
 *   y/a/n/p   审批(只在 approval 焦点上下文激活,kimi3 控制激活态)
 */
import { onMounted, onUnmounted } from 'vue';

export interface HotkeySpec {
  /** 主键,如 'b' / 'Enter' / 'Escape'。大小写不敏感(字母键)。 */
  key: string;
  /** 修饰键组合。 */
  meta?: boolean; // ⌘(Mac)/ Ctrl(Windows)
  ctrl?: boolean;
  alt?: boolean; // ⌥
  shift?: boolean;
  /**
   * handler:**必须显式返回 true 才会阻止默认行为 + 停止冒泡**。
   * 返回 false 或 void(不写 return)= 不阻止默认(让事件继续传播)。
   * 这避免了"忘记 return 就误吞事件"的常见 bug。
   */
  handler: (e: KeyboardEvent) => boolean | void;
}

const registry: HotkeySpec[] = [];

function match(spec: HotkeySpec, e: KeyboardEvent): boolean {
  if (spec.meta && !(e.metaKey || e.ctrlKey)) return false;
  if (spec.ctrl && !e.ctrlKey) return false;
  if (spec.alt && !e.altKey) return false;
  if (spec.shift && !e.shiftKey) return false;
  // 字母键大小写不敏感
  const key = spec.key.toLowerCase();
  const eKey = (e.key || '').toLowerCase();
  // ⌥+字母在 Mac 上会产生组合字符(如 ⌥+s = ß),用 e.code 兜底(KeyS)
  if (key.length === 1 && eKey !== key) {
    if (e.code === 'Key' + spec.key.toUpperCase()) return true;
    return false;
  }
  return eKey === key;
}

function onKeydown(e: KeyboardEvent) {
  // CJK 输入法 composing 中(拼音/日文/韩文未确认)直接放弃所有快捷键。
  // 否则中文用户按 y/a/n/p 会误触审批单键(spec A7 点名要防的,#20767)。
  if (e.isComposing) return;

  // 输入框/textarea 里,只放行纯修饰组合(避免拦截打字)
  const target = e.target as HTMLElement | null;
  const inEditable =
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable);

  // keyCode 229 = IME 正在处理按键(老式浏览器/某些输入法的 composing 信号),
  // 跟 isComposing 互为补充。
  if (e.keyCode === 229) return;

  for (const spec of registry) {
    if (!match(spec, e)) continue;
    // 在输入框里,除非带 meta/ctrl 修饰,否则不触发
    if (inEditable && !spec.meta && !spec.ctrl) continue;

    const handled = spec.handler(e);
    // 只有 handler 显式返回 true 才阻止默认 + 停止冒泡。
    // 返回 false / void 都视为"未处理",事件继续传播。
    if (handled === true) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeydown, true);
}

/**
 * 注册一个快捷键(组件级)。返回反注册函数,组件 onUnmounted 时调。
 *
 * @example
 * const unregister = register({
 *   key: 'b', meta: true,
 *   handler: () => { ui.openReview(); return true; },
 * });
 * onUnmounted(unregister);
 */
export function register(spec: HotkeySpec): () => void {
  registry.push(spec);
  return () => {
    const i = registry.indexOf(spec);
    if (i >= 0) registry.splice(i, 1);
  };
}

/**
 * 组件级 helper:在 setup 里用,自动绑定 onMounted/onUnmounted。
 */
export function useHotkeys(specs: HotkeySpec[]) {
  const unregisters: Array<() => void> = [];
  onMounted(() => {
    for (const s of specs) unregisters.push(register(s));
  });
  onUnmounted(() => {
    for (const u of unregisters) u();
  });
}
