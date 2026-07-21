<script setup lang="ts">
/**
 * ReviewPane —— 右侧滑出 Review 面板(.review-pane/.rp-*,样式见 styles/diff.css)
 *
 * - 开合状态读 useUIState().reviewPaneOpen(⌘B 由全局快捷键所有者切换),
 *   × 按钮调 closeReview();Esc 不在这里注册 —— Esc 走全局分层关闭
 *   (useUIState.escClose,overlayStack 已把 review 列为最上层),组件再注册
 *   会抢先吞掉事件、破坏 DetailPane/SideTask 的分层关闭(已报备)
 * - .rp-head:标题「Review · N 个文件」+ .rp-branch + × 关闭
 * - .rp-filter:文件名/路径子串过滤(小写不敏感)+ 全部展开/全部折叠
 * - .rp-tree:按目录分组的文件树(组头 chevron + 目录名 + 文件数 + 合计增删,
 *   可折叠;根目录文件平铺不进组),单选 active;搜索中强制全部展开
 * - .rp-content:每个文件一个 .rp-diff(未选中的带 hidden 属性,对齐
 *   prototype mock/shared.js bindReviewPane 的切换方式,保留各自展开态),
 *   内嵌 .diff-inline 头 + DiffLines
 *
 * ReviewPaneProps 不在 types/codex.ts 冻结契约里,props 按任务书内联定义。
 */
import { computed, ref, watch } from 'vue';
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

// ---------- 搜索过滤 ----------
const query = ref('');
const searching = computed(() => query.value.trim().length > 0);
/** 按文件名/路径子串过滤(小写不敏感);空串显示全部 */
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.files;
  return props.files.filter((f) => f.path.toLowerCase().includes(q));
});

// ---------- 目录分组 ----------
/** 根目录文件(路径无 /)平铺,不进任何组 */
const rootFiles = computed(() => filtered.value.filter((f) => !f.path.includes('/')));

interface DirGroup {
  dir: string;
  files: ChangedFile[];
  additions: number;
  deletions: number;
  /** 组内有任一文件带行级统计才显示合计(对齐文件行的显隐规则) */
  hasStats: boolean;
}
/**
 * 按目录路径(最后一个 / 之前)扁平分组;组按目录名排序,组内保持 props
 * 顺序(与下方 diff 区一致)。过滤后无可见文件的组自然不存在 = 整组隐藏。
 */
const groups = computed<DirGroup[]>(() => {
  const byDir = new Map<string, ChangedFile[]>();
  for (const f of filtered.value) {
    const i = f.path.lastIndexOf('/');
    if (i < 0) continue;
    const dir = f.path.slice(0, i);
    const arr = byDir.get(dir);
    if (arr) arr.push(f);
    else byDir.set(dir, [f]);
  }
  return [...byDir.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, files]) => ({
      dir,
      files,
      additions: files.reduce((s, f) => s + (f.additions ?? 0), 0),
      deletions: files.reduce((s, f) => s + (f.deletions ?? 0), 0),
      hasStats: files.some((f) => f.additions !== undefined),
    }));
});

// ---------- 折叠态(默认全展开;搜索中强制展开,保证命中行可见) ----------
const collapsed = ref<Set<string>>(new Set());
function isOpen(dir: string): boolean {
  return searching.value || !collapsed.value.has(dir);
}
function toggleGroup(dir: string) {
  const next = new Set(collapsed.value);
  if (next.has(dir)) next.delete(dir);
  else next.add(dir);
  collapsed.value = next;
}
function expandAll() {
  collapsed.value = new Set();
}
function collapseAll() {
  collapsed.value = new Set(groups.value.map((g) => g.dir));
}

/** 文件行只显示 basename(目录信息已在组头) */
function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
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

    <div class="rp-filter">
      <CodexIcon name="search" size="sm" />
      <input
        v-model="query"
        type="text"
        class="rp-query"
        placeholder="过滤文件名 / 路径…"
        aria-label="过滤文件"
      />
      <button v-if="query" class="icon-btn rp-clear" title="清除" @click="query = ''">
        <CodexIcon name="x" size="sm" />
      </button>
      <button class="icon-btn" title="全部展开" @click="expandAll">
        <CodexIcon name="chevron-down" size="sm" />
      </button>
      <button class="icon-btn" title="全部折叠" @click="collapseAll">
        <CodexIcon name="chevron-right" size="sm" />
      </button>
    </div>

    <div class="rp-tree">
      <template v-if="filtered.length">
        <!-- 根目录文件:平铺不进组 -->
        <button
          v-for="f in rootFiles"
          :key="f.path"
          class="rp-row"
          :class="{ active: f.path === selected }"
          :title="f.path"
          @click="selectFile(f.path)"
        >
          <span class="rf-status" :class="f.status">{{ f.status }}</span>
          <span class="rf-name">{{ baseName(f.path) }}</span>
          <span v-if="f.additions !== undefined" class="rf-stats"
            ><span class="add">+{{ f.additions }}</span
            ><span class="del">−{{ f.deletions }}</span></span
          >
        </button>

        <!-- 目录组:可折叠,组内无可见文件时整组不渲染 -->
        <div v-for="g in groups" :key="g.dir" class="rp-group">
          <button class="rp-dir" :aria-expanded="isOpen(g.dir)" @click="toggleGroup(g.dir)">
            <span class="rd-chevron" :class="{ open: isOpen(g.dir) }">
              <CodexIcon name="chevron-right" />
            </span>
            <span class="rd-name" :title="g.dir">{{ g.dir }}</span>
            <span class="rd-count">{{ g.files.length }}</span>
            <span v-if="g.hasStats" class="rf-stats"
              ><span class="add">+{{ g.additions }}</span
              ><span class="del">−{{ g.deletions }}</span></span
            >
          </button>
          <div v-show="isOpen(g.dir)" class="rp-children">
            <button
              v-for="f in g.files"
              :key="f.path"
              class="rp-row"
              :class="{ active: f.path === selected }"
              :title="f.path"
              @click="selectFile(f.path)"
            >
              <span class="rf-status" :class="f.status">{{ f.status }}</span>
              <span class="rf-name">{{ baseName(f.path) }}</span>
              <span v-if="f.additions !== undefined" class="rf-stats"
                ><span class="add">+{{ f.additions }}</span
                ><span class="del">−{{ f.deletions }}</span></span
              >
            </button>
          </div>
        </div>
      </template>
      <div v-else class="rp-empty">无匹配文件</div>
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
