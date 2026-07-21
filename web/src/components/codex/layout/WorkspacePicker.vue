<script setup lang="ts">
/**
 * WorkspacePicker —— 「新建任务」的工作区选择弹层(轮次 4a)
 *
 * 点按钮弹出工作区列表(name + shortPath,当前活跃打勾),选中 emit('select', id)。
 * 弹层类名复用 composer.css 的 model-pop/mp-* 体系,scoped 只放定位。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { WorkspaceView } from '../../../types';
import CodexIcon from './CodexIcon.vue';
import PromptDialog from './PromptDialog.vue';
import { useTauriDaemon } from '../../../composables/codex/useTauriDaemon';

const props = withDefaults(defineProps<{ workspaces: WorkspaceView[]; currentId: string; trigger?: 'full' | 'caret' | 'text' | 'pill' }>(), {
  trigger: 'full',
});
const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'add-workspace', path: string): void;
}>();

const { isTauri } = useTauriDaemon();

const open = ref(false);
/** 添加工作区的路径输入(浏览器 dev 无原生对话框,退回手输) */
const addOpen = ref(false);

const currentName = computed(() => {
  if (!props.currentId) return '选择工作区';
  return props.workspaces.find((w) => w.id === props.currentId)?.name ?? props.currentId;
});

/** 添加工作区:桌面走原生文件夹选择器;浏览器 dev 退回 PromptDialog 手输 */
async function onAddWorkspace() {
  open.value = false;
  if (isTauri()) {
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const picked = await openDialog({ directory: true, multiple: false, title: '选择工作区文件夹' });
    if (typeof picked === 'string' && picked) emit('add-workspace', picked);
    return;
  }
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
    <button v-if="props.trigger === 'full'" class="new-task" @click.stop="open = !open">
      <CodexIcon name="plus" />
      新建任务
      <CodexIcon name="chevron-down" size="sm" class="wp-caret" />
    </button>
    <button v-else-if="props.trigger === 'pill'" class="perm-pill" title="当前工作区,点击切换" @click.stop="open = !open">
      <CodexIcon name="file" />
      <span class="ellipsis wp-pill-name">{{ currentName }}</span>
      <CodexIcon name="chevron-down" size="sm" />
    </button>
    <button v-else-if="props.trigger === 'text'" class="wp-text-btn" title="切换工作区" @click.stop="open = !open">
      <span class="wp-text-name ellipsis">{{ currentName }}</span>
      <CodexIcon name="chevron-down" size="sm" />
    </button>
    <button v-else class="wp-caret-btn" title="选择工作区" @click.stop="open = !open">
      <CodexIcon name="chevron-down" size="sm" />
    </button>
    <div v-if="open" class="wp-pop" :class="{ 'wp-pop-up': props.trigger === 'pill' }">
      <button class="mp-item" @click="onAddWorkspace">
        <span class="mi-ic"><CodexIcon name="plus" /></span>
        <span class="mp-name">添加工作区…</span>
      </button>
      <div class="mp-sep"></div>
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
  min-width: 208px;
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
/* 弹层向上(pill 形态在 Composer 底部) */
.wp-pop-up { top: auto; bottom: calc(100% + 8px); }
.wp-pill-name { max-width: 140px; }

/* 顶栏面包屑形态(trigger="text"):文字 + chevron,长得像标题 */
.wp-text-btn {
  display: flex; align-items: center; gap: 5px;
  max-width: 320px;
  padding: 4px 6px;
  border-radius: var(--r-md);
  font-size: var(--text-lg); font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
  transition: background var(--dur-1);
}
.wp-text-btn:hover { background: var(--hover); }
.wp-text-btn .ic { color: var(--text-3); flex: none; }
</style>
