<script setup lang="ts">
/**
 * CodexIcon —— codex UI 的统一图标组件(prototype v2 内联 SVG 体系的 Vue 版)
 *
 * 用法:<CodexIcon name="terminal" /> / <CodexIcon name="check" size="sm" />
 * - name 查注册表,未注册的名字渲染空 svg(开发期控制台可见)
 * - size:'sm'(13px)/ 默认(16px)/ 'lg'(18px),对应 base.css 的 .ic/.ic-sm/.ic-lg
 * - 图标体在 ICONS 注册表集中维护;fill 类图标(stop/more/grip)用 fill 渲染
 */
import { computed } from 'vue';

interface IconDef {
  body: string;
  /** true = 用 currentColor 填充(否则按描边渲染) */
  fill?: boolean;
  /** 描边宽度,默认 1.8 */
  sw?: number;
}

const ICONS: Record<string, IconDef> = {
  'chevron-down': { body: '<path d="M6 9l6 6 6-6"/>' },
  'chevron-right': { body: '<path d="M9 6l6 6-6 6"/>', sw: 2 },
  plus: { body: '<path d="M12 5v14M5 12h14"/>' },
  search: { body: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/>' },
  settings: {
    body: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  },
  'panel-left': { body: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>' },
  'panel-right': { body: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>' },
  'panel-side': { body: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>' },
  more: { body: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>', fill: true },
  x: { body: '<path d="M18 6L6 18M6 6l12 12"/>', sw: 2 },
  check: { body: '<path d="M20 6L9 17l-5-5"/>', sw: 2.2 },
  'check-circle': { body: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12l2.5 2.5 4.5-5"/>' },
  circle: { body: '<circle cx="12" cy="12" r="8.5"/>' },
  'circle-dot': { body: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>' },
  terminal: { body: '<path d="M4 17l6-6-6-6"/><path d="M12 19h8"/>' },
  copy: { body: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>' },
  list: { body: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>' },
  flag: { body: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>' },
  grip: { body: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>', fill: true },
  stop: { body: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>', fill: true },
  file: { body: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>' },
  'file-code': { body: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9.5 12.5L7.5 14.5l2 2M14.5 12.5l2 2-2 2"/>' },
  archive: { body: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>' },
  shield: { body: '<path d="M12 22s8-3.6 8-10V5.5L12 2 4 5.5V12c0 6.4 8 10 8 10z"/>' },
  'arrow-up': { body: '<path d="M12 19V5M5 12l7-7 7 7"/>', sw: 2 },
  clock: { body: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>' },
  pencil: { body: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>' },
  trash: { body: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>' },
  external: { body: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>' },
  pin: { body: '<path d="M12 17v5"/><path d="M9 11V4h6v7l3 5H6l3-5z"/>' },
  play: { body: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>' },
  apps: { body: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>' },
  wrap: { body: '<path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4"/><path d="M8 16l-3 2 3 2"/>' },
  bot: { body: '<rect x="5" y="9" width="14" height="11" rx="2.5"/><path d="M12 9V5.5"/><circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none"/><circle cx="9.5" cy="14" r="0.6" fill="currentColor" stroke="none"/><circle cx="14.5" cy="14" r="0.6" fill="currentColor" stroke="none"/><path d="M9.5 16.8h5"/>' },
  sliders: { body: '<circle cx="16" cy="6" r="2.2"/><circle cx="8" cy="12" r="2.2"/><circle cx="16" cy="18" r="2.2"/><path d="M3 6h10.5M18.5 6H21M3 12h2.5M10.5 12H21M3 18h10.5M18.5 18H21"/>' },
  sparkle: { body: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>' },
  target: { body: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>' },
  plan: { body: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>' },
  reply: { body: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v2"/>' },
  info: { body: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 11h1.2v5H11"/>' },
  keyboard: { body: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>' },
  sun: { body: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' },
  moon: { body: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' },
  alert: { body: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>' },
  'git-branch': { body: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7"/><path d="M18 10.5c0 4-4 4-6.5 5.5"/>' },
  spinner: { body: '<path d="M12 3a9 9 0 1 0 9 9"/>', sw: 2.4 },
};

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
});

const def = computed<IconDef>(() => {
  const d = ICONS[props.name];
  if (!d) {
    console.warn(`[CodexIcon] 未注册的图标名: ${props.name}`);
    return { body: '' };
  }
  return d;
});
const cls = computed(() => (props.size === 'md' ? 'ic' : `ic ic-${props.size}`));
</script>

<template>
  <svg
    :class="cls"
    viewBox="0 0 24 24"
    :fill="def.fill ? 'currentColor' : 'none'"
    :stroke="def.fill ? 'none' : 'currentColor'"
    :stroke-width="def.sw ?? 1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="def.body"
  />
</template>
