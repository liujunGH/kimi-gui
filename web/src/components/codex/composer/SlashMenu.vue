<script setup lang="ts">
/**
 * SlashMenu —— `/` 斜杠命令补全浮层(契约:types/codex.ts SlashMenuProps/Emits)
 *
 * 行为(组件内,翻译自 prototype/mock/shared.js bindComposerAssist):
 * - 过滤:query 子串匹配(大小写不敏感;name 带不带前导 '/' 都兼容)
 * - 键盘:window keydown(卸载移除)—— ↑↓ 移动内部 cursor(.active 高亮 +
 *   scrollIntoView nearest),Enter/Tab 选中 emit('select', current),Esc emit('close')
 * - 鼠标:点击项 = 选中;mousedown.prevent 保住 textarea 焦点与选区
 * - 点击 .composer 外部 = emit('close')(document 监听,卸载移除)
 * - skillsLoading:Skills 组显示「加载中…」占位行
 *
 * 注:契约 SlashMenuEmits 含 update:query(配 v-model:query);query 由父组件
 * 按输入框文本派生,本组件不回写,故不 emit 该事件。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
  BuiltinCommand,
  Skill,
  SlashMenuProps,
  SlashMenuEmits,
} from '../../../types/codex';

const props = defineProps<SlashMenuProps>();
const emit = defineEmits<SlashMenuEmits>();

const rootEl = ref<HTMLElement | null>(null);
/** 键盘光标:items 扁平列表的下标(内置命令在前,Skills 在后,与渲染顺序一致) */
const cursor = ref(0);

const query = computed(() => props.query.toLowerCase());

/** 匹配时忽略前导 '/',兼容契约(name:'/new')与原型(cmd:'new')两种写法 */
function norm(name: string): string {
  return name.replace(/^\/+/, '').toLowerCase();
}
function cmdText(name: string): string {
  return name.startsWith('/') ? name : '/' + name;
}

const filteredBuiltin = computed(() =>
  props.builtin.filter((c) => norm(c.name).includes(query.value)),
);
const filteredSkills = computed(() =>
  props.skills.filter((s) => s.name.toLowerCase().includes(query.value)),
);
const items = computed<Array<BuiltinCommand | Skill>>(() =>
  // 上限 50:skills 多时全量渲染几百个 button 会卡(模糊过滤后通常远小于此)
  [...filteredBuiltin.value, ...filteredSkills.value].slice(0, 50),
);

watch(items, () => {
  cursor.value = 0;
});

async function scrollActiveIntoView() {
  await nextTick();
  rootEl.value?.querySelector('.assist-item.active')?.scrollIntoView({ block: 'nearest' });
}

function pick(i: number) {
  const item = items.value[i];
  if (item) emit('select', item);
}

function onKeydown(e: KeyboardEvent) {
  const total = items.value.length;
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
    <div class="as-label">命令</div>
    <div class="as-list">
      <div v-if="!items.length && !props.skillsLoading" class="as-empty">无匹配命令</div>
      <button
        v-for="(c, i) in filteredBuiltin"
        :key="'b-' + c.name"
        class="assist-item"
        :class="{ active: cursor === i }"
        @mousedown.prevent
        @click="pick(i)"
      >
        <span class="as-cmd">{{ cmdText(c.name) }}</span>
        <span class="as-desc">{{ c.desc }}</span>
      </button>
      <template v-if="props.skillsLoading || filteredSkills.length">
        <div class="as-label as-label-sub">Skills<span class="as-dynamic">动态</span></div>
        <div v-if="props.skillsLoading" class="as-empty">加载中…</div>
        <template v-else>
          <button
            v-for="(s, j) in filteredSkills"
            :key="'s-' + s.name"
            class="assist-item"
            :class="{ active: cursor === filteredBuiltin.length + j }"
            @mousedown.prevent
            @click="pick(filteredBuiltin.length + j)"
          >
            <span class="as-cmd">{{ cmdText(s.name) }}</span>
            <span class="as-desc">{{ s.description }}</span>
            <span class="as-tag">skill</span>
          </button>
        </template>
      </template>
    </div>
  </div>
</template>
