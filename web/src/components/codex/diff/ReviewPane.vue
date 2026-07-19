<script setup lang="ts">
/**
 * ReviewPane —— 右侧滑出 Review 面板(.review-pane/.rp-*,样式见 styles/diff.css)
 *
 * - 开合状态读 useUIState().reviewPaneOpen(⌘B 由全局快捷键所有者切换),
 *   × 按钮调 closeReview();Esc 不在这里注册 —— Esc 走全局分层关闭
 *   (useUIState.escClose,overlayStack 已把 review 列为最上层),组件再注册
 *   会抢先吞掉事件、破坏 DetailPane/SideTask 的分层关闭(已报备)
 * - .rp-head:标题「Review · N 个文件」+ .rp-branch + × 关闭
 * - .rp-files:文件 chip(M/A/D 徽章 + 名 + 增删统计),单选 active
 * - .rp-content:每个文件一个 .rp-diff(未选中的带 hidden 属性,对齐
 *   prototype mock/shared.js bindReviewPane 的切换方式,保留各自展开态),
 *   内嵌 .diff-inline 头 + DiffLines
 *
 * ReviewPaneProps 不在 types/codex.ts 冻结契约里,props 按任务书内联定义。
 */
import { ref, watch } from 'vue';
import type { ChangedFile, DiffHunk } from '../../../types/codex';
import { useUIState } from '../../../composables/codex/useUIState';
import CodexIcon from '../layout/CodexIcon.vue';
import DiffLines from './DiffLines.vue';

const props = withDefaults(
  defineProps<{
    files: ChangedFile[];
    hunksByFile: Record<string, DiffHunk[]>;
    branch?: string;
  }>(),
  { branch: '' },
);

const { reviewPaneOpen, closeReview } = useUIState();

const emit = defineEmits<{ (e: 'select-file', path: string): void }>();

const selected = ref(props.files[0]?.path ?? '');
watch(
  () => props.files,
  (fs) => {
    if (!fs.some((f) => f.path === selected.value)) selected.value = fs[0]?.path ?? '';
  },
);
function selectFile(path: string) {
  selected.value = path;
  emit('select-file', path);
}
</script>

<template>
  <aside class="review-pane" :class="{ open: reviewPaneOpen }">
    <div class="rp-head">
      <span class="rp-title">Review · {{ props.files.length }} 个文件</span>
      <span v-if="props.branch" class="rp-branch">{{ props.branch }}</span>
      <button class="icon-btn rp-close" title="关闭 Esc" @click="closeReview">
        <CodexIcon name="x" size="sm" />
      </button>
    </div>

    <div class="rp-files">
      <button
        v-for="f in props.files"
        :key="f.path"
        class="rp-file"
        :class="{ active: f.path === selected }"
        @click="selectFile(f.path)"
      >
        <span class="rf-status" :class="f.status">{{ f.status }}</span>
        {{ f.path }}
        <span v-if="f.additions !== undefined" class="rf-stats"
          ><span class="add">+{{ f.additions }}</span
          ><span class="del">−{{ f.deletions }}</span></span
        >
      </button>
    </div>

    <div class="rp-content">
      <div
        v-for="f in props.files"
        :key="f.path"
        class="rp-diff"
        :hidden="f.path !== selected"
      >
        <div class="diff-inline">
          <div class="diff-head">
            <CodexIcon name="file" />
            <span class="diff-file">{{ f.path }}</span>
            <span class="diff-stats"
              ><span class="add">+{{ f.additions }}</span
              ><span class="del">−{{ f.deletions }}</span></span
            >
          </div>
          <DiffLines :hunks="props.hunksByFile[f.path] ?? []" />
        </div>
      </div>
    </div>
  </aside>
</template>
