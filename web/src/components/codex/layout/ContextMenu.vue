<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import type { ContextMenuItem, ContextMenuPosition } from '../../../lib/contextMenu';
import { clampContextMenuPosition } from '../../../lib/contextMenu';
import CodexIcon from './CodexIcon.vue';

const props = withDefaults(defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  ariaLabel?: string;
}>(), { ariaLabel: '上下文菜单' });

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'close'): void;
}>();

const menuEl = ref<HTMLElement | null>(null);
const pos = ref<ContextMenuPosition>({ x: 0, y: 0 });
let listening = false;

function close(): void {
  emit('close');
}

function enabledButtons(): HTMLButtonElement[] {
  return Array.from(menuEl.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
}

function focusRelative(delta: number): void {
  const buttons = enabledButtons();
  if (!buttons.length) return;
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = current < 0 ? (delta > 0 ? 0 : buttons.length - 1) : (current + delta + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusRelative(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    focusRelative(-1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    enabledButtons()[0]?.focus();
  } else if (event.key === 'End') {
    event.preventDefault();
    enabledButtons().at(-1)?.focus();
  }
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null;
  if (target && !menuEl.value?.contains(target)) close();
}

function onOtherContextMenu(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (target && !menuEl.value?.contains(target)) close();
}

function bind(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('contextmenu', onOtherContextMenu, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);
}

function unbind(): void {
  if (!listening) return;
  listening = false;
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('contextmenu', onOtherContextMenu, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('blur', close);
  window.removeEventListener('resize', close);
  window.removeEventListener('scroll', close, true);
}

async function positionAndFocus(): Promise<void> {
  pos.value = { x: props.x, y: props.y };
  await nextTick();
  const el = menuEl.value;
  if (!el || !props.open) return;
  const rect = el.getBoundingClientRect();
  pos.value = clampContextMenuPosition(
    { x: props.x, y: props.y },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  await nextTick();
  enabledButtons()[0]?.focus({ preventScroll: true });
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      bind();
      void positionAndFocus();
    } else {
      unbind();
    }
  },
  { immediate: true },
);

watch(() => [props.x, props.y], () => {
  if (props.open) void positionAndFocus();
});

onUnmounted(unbind);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      ref="menuEl"
      class="context-menu"
      role="menu"
      :aria-label="props.ariaLabel"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      @contextmenu.prevent
      @pointerdown.stop
    >
      <template v-for="item in props.items" :key="item.id">
        <div v-if="item.separatorBefore" class="context-menu-separator" role="separator"></div>
        <button
          type="button"
          class="context-menu-item"
          :class="{ danger: item.danger }"
          :disabled="item.disabled"
          role="menuitem"
          @click="emit('select', item.id)"
        >
          <CodexIcon v-if="item.icon" :name="item.icon" size="sm" />
          <span class="context-menu-label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="context-menu-shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: var(--z-dropdown);
  min-width: 190px;
  max-width: min(280px, calc(100vw - 16px));
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  /* --surface is not a project token; an unresolved background value makes
     the teleported menu fully transparent over the sidebar/chat content. */
  background: var(--color-surface-raised, var(--bg));
  box-shadow: var(--shadow-lg);
  color: var(--text);
}
.context-menu-item {
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: default;
}
.context-menu-item:hover,
.context-menu-item:focus-visible {
  outline: none;
  background: var(--bg-hover);
}
.context-menu-item:disabled {
  opacity: 0.42;
}
.context-menu-item.danger {
  color: var(--danger);
}
.context-menu-item :deep(.ic) {
  flex: none;
  color: currentColor;
}
.context-menu-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-menu-shortcut {
  margin-left: 12px;
  color: var(--text-3);
  font-size: var(--text-xs);
}
.context-menu-separator {
  height: 1px;
  margin: 4px 5px;
  background: var(--border-soft);
}
</style>
