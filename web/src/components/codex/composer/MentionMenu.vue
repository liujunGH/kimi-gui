<script setup lang="ts">
/**
 * MentionMenu —— `@` 文件提及补全浮层(契约:types/codex.ts MentionMenuProps/Emits)
 *
 * 与 SlashMenu 同一骨架换数据源:
 * - 过滤:query 子串匹配 path(大小写不敏感)
 * - 键盘:window keydown(卸载移除)—— ↑↓ 移动内部 cursor(.active 高亮 +
 *   scrollIntoView nearest),Enter/Tab 选中 emit('select', file),Esc emit('close')
 * - 鼠标:点击项 = 选中;mousedown.prevent 保住 textarea 焦点与选区
 * - 点击 .composer 外部 = emit('close')(document 监听,卸载移除)
 * - filesLoading:显示「加载中…」占位行
 *
 * 注:契约 MentionMenuEmits 含 update:query(配 v-model:query);query 由父组件
 * 按输入框文本派生,本组件不回写,故不 emit 该事件。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { MentionMenuProps, MentionMenuEmits } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<MentionMenuProps>();
const emit = defineEmits<MentionMenuEmits>();

const rootEl = ref<HTMLElement | null>(null);
const cursor = ref(0);

const filtered = computed(() => {
  const q = props.query.toLowerCase();
  return props.files.filter((f) => f.path.toLowerCase().includes(q));
});

watch(filtered, () => {
  cursor.value = 0;
});

async function scrollActiveIntoView() {
  await nextTick();
  rootEl.value?.querySelector('.assist-item.active')?.scrollIntoView({ block: 'nearest' });
}

function pick(i: number) {
  const file = filtered.value[i];
  if (file) emit('select', file);
}

function onKeydown(e: KeyboardEvent) {
  const total = filtered.value.length;
  if (e.key === 'ArrowDown') {
    if (!total) return;
    e.preventDefault();
    cursor.value = Math.min(cursor.value + 1, total - 1);
    scrollActiveIntoView();
  } else if (e.key === 'ArrowUp') {
    if (!total) return;
    e.preventDefault();
    cursor.value = Math.max(cursor.value - 1, 0);
    scrollActiveIntoView();
  } else if ((e.key === 'Enter' || e.key === 'Tab') && total) {
    e.preventDefault();
    pick(cursor.value);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
  }
}

function onDocClick(e: MouseEvent) {
  const target = e.target as Node | null;
  const composerEl = rootEl.value?.closest('.composer');
  if (composerEl && target && !composerEl.contains(target)) emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocClick);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('click', onDocClick);
});
</script>

<template>
  <div ref="rootEl" class="assist-pop open">
    <div class="as-label">文件</div>
    <div class="as-list">
      <div v-if="props.filesLoading" class="as-empty">加载中…</div>
      <div v-else-if="!filtered.length" class="as-empty">无匹配文件</div>
      <button
        v-for="(f, i) in filtered"
        :key="f.path"
        class="assist-item"
        :class="{ active: cursor === i }"
        @mousedown.prevent
        @click="pick(i)"
      >
        <span class="mi-ic"><CodexIcon name="file" /></span>
        <span class="as-cmd as-file">{{ f.path }}</span>
      </button>
    </div>
  </div>
</template>
