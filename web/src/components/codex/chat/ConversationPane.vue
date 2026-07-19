<script setup lang="ts">
/**
 * ConversationPane —— 对话流容器
 *
 * - 按 turns 有序渲染 MessageUser / MessageAssistant
 * - 末尾:pendingApproval → ApprovalCard;running + turnProgress → TurnProgress
 * - 滚锚(Q4 归 kimi3):用户贴底时新内容自动跟随;上翻后不抢滚动
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { ConversationPaneProps, ConversationPaneEmits } from '../../../types/codex';
import MessageUser from './MessageUser.vue';
import MessageAssistant from './MessageAssistant.vue';
import TurnProgress from './TurnProgress.vue';

const props = defineProps<ConversationPaneProps>();
const emit = defineEmits<ConversationPaneEmits>();

const scrollEl = ref<HTMLElement | null>(null);
const nearBottom = ref(true);

const lastTurnId = computed(() => props.turns[props.turns.length - 1]?.id);

function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
}

async function maybeFollow() {
  await nextTick();
  const el = scrollEl.value;
  if (el && nearBottom.value) el.scrollTop = el.scrollHeight;
}

watch(
  () => [props.turns.length, props.turns[props.turns.length - 1]?.blocks?.length],
  maybeFollow,
);
onMounted(maybeFollow);

// 保持 emit 声明被使用(契约):取消当前轮由 Composer stop 触发,这里转发给外部备用
void emit;
</script>

<template>
  <div ref="scrollEl" class="app-conversation" @scroll="onScroll">
    <div class="conversation">
      <template v-for="t in props.turns" :key="t.id">
        <MessageUser v-if="t.role === 'user'" :turn="t" />
        <MessageAssistant
          v-else-if="t.role === 'assistant'"
          :turn="t"
          :todos="props.todosByTurn[t.id] ?? []"
          :running="props.running && t.id === lastTurnId"
        />
      </template>

      <div v-if="props.pendingApproval" class="msg-assistant">
        <slot name="approval" :approval="props.pendingApproval" />
      </div>

      <TurnProgress v-if="props.turnProgress" v-bind="props.turnProgress" />
    </div>
  </div>
</template>
