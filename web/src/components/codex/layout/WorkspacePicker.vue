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

const props = defineProps<{ workspaces: WorkspaceView[]; currentId: string }>();
const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'add-workspace', path: string): void;
}>();

const open = ref(false);

function onAddWorkspace() {
  const path = window.prompt('输入工作区路径(如 ~/project/my-app)');
  if (path?.trim()) {
    emit('add-workspace', path.trim());
  }
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.workspace-picker')) open.value = false;
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
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
