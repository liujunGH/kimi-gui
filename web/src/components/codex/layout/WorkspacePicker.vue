<script setup lang="ts">
/**
 * WorkspacePicker —— 「新建任务」的工作区选择弹层(轮次 4a)
 *
 * 点按钮弹出工作区列表(name + shortPath,当前活跃打勾),选中 emit('select', id)。
 * 弹层类名复用 composer.css 的 model-pop/mp-* 体系,scoped 只放定位。
 */
import { onMounted, onUnmounted, ref } from 'vue';
import type { WorkspaceView } from '../../../types';
import CodexIcon from './CodexIcon.vue';
import PromptDialog from './PromptDialog.vue';

const props = defineProps<{ workspaces: WorkspaceView[]; currentId: string }>();
const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'add-workspace', path: string): void;
}>();

const open = ref(false);
/** 添加工作区的路径输入(WKWebView 无 window.prompt,走应用内弹层) */
const addOpen = ref(false);

function onAddWorkspace() {
  open.value = false;
  addOpen.value = true;
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.workspace-picker')) open.value = false;
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation(); // 防穿透:全局 escClose 在 window 相,别连带关底层浮层
    open.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKey);
});
</script>

<template>
  <div class="workspace-picker">
    <button class="new-task" @click.stop="open = !open">
      <CodexIcon name="plus" />
      新建任务
      <CodexIcon name="chevron-down" size="sm" class="wp-caret" />
    </button>
    <div v-if="open" class="wp-pop">
      <div class="mp-label">选择工作区</div>
      <button
        v-for="w in props.workspaces"
        :key="w.id"
        class="mp-item"
        :class="{ active: w.id === props.currentId }"
        @click="
          emit('select', w.id);
          open = false;
        "
      >
        <span class="mi-ic"><CodexIcon name="file" /></span>
        <span class="mp-text">
          <span class="mp-name">{{ w.name }}</span>
          <span class="mp-desc">{{ w.shortPath }}</span>
        </span>
        <CodexIcon v-if="w.id === props.currentId" name="check" class="mp-check" />
      </button>
      <div class="mp-sep"></div>
      <button class="mp-item" @click="onAddWorkspace">
        <span class="mi-ic"><CodexIcon name="plus" /></span>
        <span class="mp-name">添加工作区…</span>
      </button>
    </div>
    <PromptDialog
      v-if="addOpen"
      title="添加工作区"
      placeholder="输入工作区路径(如 ~/project/my-app)"
      confirm-label="添加"
      @confirm="(p: string) => { addOpen = false; emit('add-workspace', p); }"
      @cancel="addOpen = false"
    />
  </div>
</template>

<style scoped>
.workspace-picker {
  position: relative;
}
.wp-caret {
  margin-left: auto;
  opacity: 0.5;
}
.wp-pop {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 70;
  display: flex;
  flex-direction: column;
  padding: 4px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-md);
  animation: fade-up var(--dur-2) var(--ease);
}
</style>
