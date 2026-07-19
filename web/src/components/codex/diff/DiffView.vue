<script setup lang="ts">
/**
 * DiffView —— 对话流内联 diff 卡(.diff-inline,样式见 styles/diff.css)
 *
 * - .diff-head:file 图标 + .diff-file 路径 + .diff-stats(+add −del)
 * - 多文件(files.length > 1)时头部上方加文件 chip 切换(复用 Review pane 的
 *   .rp-files/.rp-file 样式,单文件不显示)
 * - 行渲染委托 DiffLines;syntaxHighlight 透传(关闭时退化为纯文本)
 *
 * 轮次 3 契约修正:`hunks` 单数组 → `hunksByFile: Record<string, DiffHunk[]>`,
 * 跟 ReviewPane 统一数据形状。chip 切换真正切 hunks(原来只换头部)。
 */
import { computed, ref, watch } from 'vue';
import type { DiffViewProps } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';
import DiffLines from './DiffLines.vue';

const props = defineProps<DiffViewProps>();

const selected = ref(props.files[0]?.path ?? '');
watch(
  () => props.files,
  (fs) => {
    if (!fs.some((f) => f.path === selected.value)) selected.value = fs[0]?.path ?? '';
  },
);

const currentFile = computed(
  () => props.files.find((f) => f.path === selected.value) ?? props.files[0],
);

// 当前选中文件的 hunks(从 hunksByFile 取,空时退化为空数组)
const currentHunks = computed(
  () => (currentFile.value ? (props.hunksByFile[currentFile.value.path] ?? []) : []),
);
</script>

<template>
  <div class="diff-inline">
    <div v-if="props.files.length > 1" class="rp-files">
      <button
        v-for="f in props.files"
        :key="f.path"
        class="rp-file"
        :class="{ active: f.path === selected }"
        @click="selected = f.path"
      >
        <span class="rf-status" :class="f.status">{{ f.status }}</span>
        {{ f.path }}
        <span class="rf-stats"
          ><span class="add">+{{ f.additions }}</span
          ><span class="del">−{{ f.deletions }}</span></span
        >
      </button>
    </div>

    <div class="diff-head">
      <CodexIcon name="file" />
      <span class="diff-file">{{ currentFile?.path ?? '变更' }}</span>
      <span class="diff-stats"
        ><span class="add">+{{ currentFile?.additions ?? 0 }}</span
        ><span class="del">−{{ currentFile?.deletions ?? 0 }}</span></span
      >
    </div>

    <DiffLines :hunks="currentHunks" :highlight="props.syntaxHighlight" />
  </div>
</template>
