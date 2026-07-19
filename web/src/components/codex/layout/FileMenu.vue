<script setup lang="ts">
/**
 * FileMenu —— diff 区域右键菜单(翻译自 prototype/mock/shared.js bindFileContextMenu)
 *
 * 用法:父组件在 diff 容器上转发右键事件 —
 *   <div class="diff-inline" @contextmenu.prevent="fileMenu?.openFileMenu($event, file)">
 *   <FileMenu ref="fileMenu" workspace-root="/abs/path/to/workspace" />
 *
 * - 菜单项:在 "VS Code" 中打开 / 打开方式 ›(hover 出二级)/ 复制所选内容(无选区灰掉)/
 *   复制路径 / 复制相对路径 / 切换自动换行(真实切换 .diff-lines.wrap)
 * - IDE 项 toast 原型模拟;复制项真实写 navigator.clipboard + toast
 * - 定位 fixed 跟随鼠标并夹取视口(220×300 余量,对齐原型)
 * - 点击外部 / Esc / 再次右键别处 = 关闭;菜单根 mousedown.prevent 保住文本选区
 *
 * workspaceRoot(契约外补充 prop,已报备):「复制路径」的绝对路径拼接根;
 * 不传时绝对路径退化为相对路径(轮次 3 由 ZCode 接工作区真源)。
 */
import { nextTick, onUnmounted, ref } from 'vue';
import CodexIcon from './CodexIcon.vue';
import { useToast } from './Toast.vue';

const props = withDefaults(defineProps<{ workspaceRoot?: string }>(), { workspaceRoot: '' });

const { toast } = useToast();

const OPEN_WITH = ['VS Code', 'Cursor', 'IntelliJ IDEA', 'Zed'] as const;

const visible = ref(false);
const pos = ref({ x: 0, y: 0 });
const file = ref('');
const hasSelection = ref(false);
const menuEl = ref<HTMLElement | null>(null);
/** 触发右键的 diff 容器:切换自动换行的作用域(.diff-lines 只在这个卡里切) */
let cardEl: HTMLElement | null = null;
/** 打开菜单的那一次 contextmenu 事件对象(见 onDocContextMenu 的竞态说明) */
let lastOpenEvent: Event | null = null;

function openFileMenu(ev: MouseEvent | { x: number; y: number }, f: string) {
  const x = 'clientX' in ev ? ev.clientX : ev.x;
  const y = 'clientY' in ev ? ev.clientY : ev.y;
  const target = 'target' in ev ? (ev.target as HTMLElement | null) : null;
  cardEl = target?.closest?.('.diff-inline, .rp-diff, .body-diff') ?? null;
  lastOpenEvent = 'target' in ev ? ev : null;
  file.value = f;
  hasSelection.value = !!String(window.getSelection());
  pos.value = {
    x: Math.max(0, Math.min(x, window.innerWidth - 220)),
    y: Math.max(0, Math.min(y, window.innerHeight - 300)),
  };
  visible.value = true;
  bindGlobalListeners();
}

function close() {
  visible.value = false;
  unbindGlobalListeners();
}

/* 全局关闭监听延迟到当前事件派发完再挂:打开菜单的同一次 contextmenu 还会继续
   冒泡到 document,同步挂监听会把刚打开的菜单立刻关掉。 */
let listening = false;
function onDocClick(e: MouseEvent) {
  const target = e.target as Node | null;
  if (menuEl.value && target && !menuEl.value.contains(target)) close();
}
function onDocContextMenu(e: MouseEvent) {
  if (e === lastOpenEvent) return; // 打开菜单的那次右键,不算"右键别处"
  close();
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
async function bindGlobalListeners() {
  if (listening) return;
  listening = true;
  await nextTick();
  if (!listening) return; // nextTick 前已被关闭
  document.addEventListener('click', onDocClick);
  document.addEventListener('contextmenu', onDocContextMenu);
  document.addEventListener('keydown', onDocKeydown);
}
function unbindGlobalListeners() {
  listening = false;
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('contextmenu', onDocContextMenu);
  document.removeEventListener('keydown', onDocKeydown);
}
onUnmounted(unbindGlobalListeners);

function clip(text: string) {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    /* 剪贴板不可用(权限/非安全上下文)时静默,toast 照常提示 */
  }
}

function absPath(f: string): string {
  if (f.startsWith('/')) return f;
  const root = props.workspaceRoot.replace(/\/+$/, '');
  return root ? `${root}/${f}` : f;
}

function openInIde(name: string) {
  close();
  toast(`已在 “${name}” 中打开(原型模拟)`);
}
function copySelection() {
  if (!hasSelection.value) return;
  clip(String(window.getSelection()));
  close();
  toast('已复制所选内容');
}
function copyAbs() {
  clip(absPath(file.value));
  close();
  toast('已复制路径');
}
function copyRel() {
  clip(file.value);
  close();
  toast('已复制相对路径');
}
function toggleWrap() {
  const scope: ParentNode = cardEl ?? document;
  scope.querySelectorAll('.diff-lines').forEach((d) => d.classList.toggle('wrap'));
  close();
}

defineExpose({ openFileMenu, close });
</script>

<template>
  <div
    v-if="visible"
    ref="menuEl"
    class="file-menu"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    @mousedown.prevent
  >
    <button class="menu-item" @click="openInIde('VS Code')">
      <span class="mi-ic"><CodexIcon name="external" /></span>
      <span class="mi-label">在 “VS Code” 中打开</span>
    </button>
    <div class="fm-sub">
      <button class="menu-item">
        <span class="mi-ic"><CodexIcon name="apps" /></span>
        <span class="mi-label">打开方式</span>
        <span class="mi-kbd"><CodexIcon name="chevron-right" /></span>
      </button>
      <div class="file-menu-sub">
        <button
          v-for="app in OPEN_WITH"
          :key="app"
          class="menu-item"
          @click="openInIde(app)"
        >
          <span class="mi-label">{{ app }}</span>
        </button>
        <div class="menu-sep"></div>
        <button class="menu-item" @click="openInIde('访达')">
          <span class="mi-label">访达</span>
        </button>
      </div>
    </div>
    <div class="menu-sep"></div>
    <button class="menu-item" :class="{ 'is-disabled': !hasSelection }" @click="copySelection">
      <span class="mi-ic"><CodexIcon name="copy" /></span>
      <span class="mi-label">复制所选内容</span>
    </button>
    <button class="menu-item" @click="copyAbs">
      <span class="mi-ic"><CodexIcon name="copy" /></span>
      <span class="mi-label">复制路径</span>
    </button>
    <button class="menu-item" @click="copyRel">
      <span class="mi-ic"><CodexIcon name="copy" /></span>
      <span class="mi-label">复制相对路径</span>
    </button>
    <div class="menu-sep"></div>
    <button class="menu-item" @click="toggleWrap">
      <span class="mi-ic"><CodexIcon name="wrap" /></span>
      <span class="mi-label">切换自动换行</span>
    </button>
  </div>
</template>
