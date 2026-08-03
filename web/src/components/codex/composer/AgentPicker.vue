<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { KimiAgentProfile } from '../../../composables/useKimiRuntime';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<{
  agents: KimiAgentProfile[];
  current: string;
  locked?: boolean;
  loading?: boolean;
  placement?: 'top' | 'bottom';
}>();
const emit = defineEmits<{ (e: 'select', name: string): void; (e: 'manage'): void }>();

const open = ref(false);
const currentProfile = computed(() => props.agents.find((agent) => agent.name === props.current));
const label = computed(() => currentProfile.value?.name ?? (props.current && props.current !== 'default' ? props.current : '默认 Agent'));

function pick(name: string) {
  emit('select', name);
  open.value = false;
}
function onDocClick(event: MouseEvent) {
  if (!(event.target as HTMLElement | null)?.closest('.agent-picker')) open.value = false;
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    open.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="agent-picker-anchor">
    <button
      class="perm-pill agent-picker"
      :class="{ open, locked }"
      :title="locked ? 'Agent 在任务创建后固定' : '选择新任务使用的 Agent'"
      @click="locked ? undefined : (open = !open)"
    >
      <CodexIcon name="bot" />
      <span class="agent-picker-label">{{ label }}</span>
      <CodexIcon v-if="!locked" name="chevron-down" size="sm" />
      <span v-else class="agent-lock">固定</span>
    </button>

    <div
      class="model-pop perm-pop agent-picker agent-pop"
      :class="{ open, 'agent-pop-down': placement === 'bottom' }"
    >
      <div class="mp-label">新任务 Agent</div>
      <button class="mp-item" :class="{ active: current === 'default' }" @click="pick('default')">
        <CodexIcon name="check" class="mp-check" />
        <span class="mp-text">
          <span class="mp-name">默认 Agent</span>
          <span class="mp-desc">使用 Kimi 内置系统提示与完整工具集</span>
        </span>
      </button>
      <button
        v-for="agent in agents"
        :key="`${agent.scope}:${agent.name}`"
        class="mp-item"
        :class="{ active: agent.name === current }"
        @click="pick(agent.name)"
      >
        <CodexIcon name="check" class="mp-check" />
        <span class="mp-text">
          <span class="mp-name">{{ agent.name }} <small>{{ agent.scope }}</small></span>
          <span class="mp-desc">{{ agent.description || agent.whenToUse || '自定义 Agent' }}</span>
        </span>
      </button>
      <div v-if="loading" class="agent-picker-state">正在发现 Agent…</div>
      <button class="agent-manage" @click="emit('manage'); open = false">管理 Agent…</button>
    </div>
  </div>
</template>
