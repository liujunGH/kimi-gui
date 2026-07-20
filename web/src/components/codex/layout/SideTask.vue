<script setup lang="ts">
/**
 * SideTask —— 侧边任务:真分栏容器(默认 slot 接内容)
 *
 * 行为(组件内,kimi3 域):
 * - open 状态:useUIState().sideTaskOpen;× 关闭调 ui.closeSideTask()
 * - 分栏让位:open 时给 .app-main 加 .side-open class(watch + onUnmounted 清理)
 * - 迷你 Composer 可用(轮次 5):v-model + Enter/按钮发送 → emit('send', text);
 *   running 时禁用;⌥⌘S 开合在 DemoApp 层注册
 *
 * 内容(slot)两种形态由 useUIState().sideTaskKind 区分:
 * 'thread'(侧边线程) | 'agent-transcript'(子 agent 钻取),由父组件组装。
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import type { SideTaskProps } from '../../../types/codex';
import CodexIcon from './CodexIcon.vue';
import { useUIState } from '../../../composables/codex/useUIState';

const props = withDefaults(defineProps<SideTaskProps & { running?: boolean }>(), {
  running: false,
});
const emit = defineEmits<{ (e: 'send', text: string): void }>();

const ui = useUIState();
const shown = computed(() => ui.sideTaskOpen.value);

const dotClass = computed(() => `dot-${props.thread.dot}`);
const pillClass = computed(() => `pill-${props.status.kind}`);

/** 迷你 Composer 输入(轮次 5:从装饰改成可用) */
const draft = ref('');
function send() {
  const text = draft.value.trim();
  if (!text || props.running) return;
  emit('send', text);
  draft.value = '';
}

/** 真分栏让位:open 时主区 .app-main 加 .side-open(padding-right 让出分栏宽) */
function appMain(): HTMLElement | null {
  return document.querySelector('.app-main');
}
watch(
  shown,
  (open) => {
    appMain()?.classList.toggle('side-open', open);
  },
  { immediate: true },
);
onUnmounted(() => {
  appMain()?.classList.remove('side-open');
});
</script>

<template>
  <aside class="side-task" :class="{ open: shown }">
    <div class="st-head">
      <CodexIcon name="panel-side" />
      <span class="st-title">{{ props.title }}</span>
      <span class="pill st-status" :class="pillClass">
        <span class="dot" :class="dotClass"></span>{{ props.status.text }}
      </span>
      <button class="icon-btn st-close" title="关闭 Esc" @click="ui.closeSideTask()">
        <CodexIcon name="x" size="sm" />
      </button>
    </div>
    <div class="st-thread">
      <span class="dot st-thread-dot" :class="dotClass"></span>
      <span class="st-thread-name">{{ props.thread.name }}</span>
      <span class="st-thread-ws">{{ props.thread.ws }}</span>
    </div>
    <div class="st-body">
      <slot />
    </div>
    <div class="st-composer">
      <div class="composer">
        <div class="composer-input">
          <textarea
            v-model="draft"
            rows="1"
            :placeholder="`给「${props.title}」发消息…`"
            :disabled="props.running"
            @keydown.enter.prevent="send"
          ></textarea>
        </div>
        <div class="composer-toolbar">
          <div class="toolbar-group">
            <button class="perm-pill perm-danger" title="权限模式:完全自主">
              <CodexIcon name="shield" />完全自主
            </button>
          </div>
          <div class="toolbar-group right">
            <button class="composer-send" title="发送" :disabled="!draft.trim() || props.running" @click="send">
              <CodexIcon name="arrow-up" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
