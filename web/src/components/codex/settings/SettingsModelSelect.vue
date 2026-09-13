<script setup lang="ts">
// 设置页统一模型选择器:对齐官方「分组弹层 + 勾选态」的模型选择体验,
// 替换各处的原生 <select>("K3(opencode-go)" 挤一行的形态)。
// 子智能体场景可传 effort —— 官方把「模型 · 强度」合并在同一控件里展示。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CodexIcon from '../layout/CodexIcon.vue';

export interface SettingsModelOption {
  id: string;
  name: string;
  provider?: string;
}

export interface SettingsModelEffortSpec {
  value: string;
  options: readonly string[];
  label: (value: string) => string;
  emptyLabel: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly SettingsModelOption[];
    /** 空值项文案(如「继承主模型」/「选择模型」);空串则不提供空值项。 */
    emptyLabel?: string;
    disabled?: boolean;
    /** 池成员行等密集场景:触发器收窄。 */
    compact?: boolean;
    ariaLabel?: string;
    effort?: SettingsModelEffortSpec | null;
  }>(),
  { emptyLabel: '', disabled: false, compact: false, ariaLabel: '模型', effort: null },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:effort': [value: string];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const groups = computed<Array<{ provider: string; models: SettingsModelOption[] }>>(() => {
  const byProvider = new Map<string, SettingsModelOption[]>();
  for (const option of props.options) {
    const key = option.provider || '其他';
    const list = byProvider.get(key);
    if (list) list.push(option);
    else byProvider.set(key, [option]);
  }
  return [...byProvider.entries()].map(([provider, models]) => ({ provider, models }));
});

const selected = computed(() => props.options.find((o) => o.id === props.modelValue) ?? null);

const triggerText = computed(() => {
  if (selected.value) {
    const effortText =
      props.effort && props.effort.value
        ? ` · ${props.effort.label(props.effort.value)}`
        : '';
    return selected.value.name + effortText;
  }
  return props.emptyLabel || '选择模型';
});

function pick(id: string): void {
  emit('update:modelValue', id);
  open.value = false;
}

function pickEffort(value: string): void {
  emit('update:effort', value);
}

function onDocClick(event: MouseEvent): void {
  if (!rootRef.value?.contains(event.target as Node)) open.value = false;
}
function onDocKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    open.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKeydown);
});
</script>

<template>
  <div ref="rootRef" class="sms" :class="{ compact: props.compact }">
    <button
      type="button"
      class="control sms-trigger"
      :class="{ open, disabled: props.disabled }"
      :aria-label="props.ariaLabel"
      :disabled="props.disabled"
      @click="open = !open"
    >
      <span class="sms-trigger-text" :title="triggerText">{{ triggerText }}</span>
      <CodexIcon name="chevron-down" size="sm" />
    </button>
    <div v-if="open" class="sms-pop" role="listbox" :aria-label="props.ariaLabel">
      <button v-if="props.emptyLabel" type="button" class="sms-item" :class="{ selected: props.modelValue === '' }" role="option" @click="pick('')">
        <span class="sms-item-name sms-dim">{{ props.emptyLabel }}</span>
        <CodexIcon v-if="props.modelValue === ''" name="check" size="sm" />
      </button>
      <div v-for="group in groups" :key="group.provider" class="sms-group">
        <div class="sms-group-label">{{ group.provider }}</div>
        <button
          v-for="m in group.models"
          :key="m.id"
          type="button"
          class="sms-item"
          :class="{ selected: m.id === props.modelValue }"
          role="option"
          @click="pick(m.id)"
        >
          <span class="sms-item-name">{{ m.name }}</span>
          <span v-if="m.id === props.modelValue" class="sms-check"><CodexIcon name="check" size="sm" /></span>
        </button>
      </div>
      <div v-if="props.effort && props.modelValue" class="sms-effort" :class="{ disabled: props.effort.disabled }">
        <span class="sms-effort-label">思考强度</span>
        <div class="sms-effort-options">
          <button
            type="button"
            class="sms-effort-btn"
            :class="{ active: props.effort.value === '' }"
            :disabled="props.effort.disabled"
            @click="pickEffort('')"
          >
            未设置
          </button>
          <button
            v-for="opt in props.effort.options"
            :key="opt"
            type="button"
            class="sms-effort-btn"
            :class="{ active: props.effort.value === opt }"
            :disabled="props.effort.disabled"
            @click="pickEffort(opt)"
          >
            {{ props.effort.label(opt) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sms {
  position: relative;
  min-width: 0;
}
.sms.compact {
  width: 200px;
  flex: none;
}
.sms-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  text-align: left;
  cursor: pointer;
}
.sms-trigger.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.sms-trigger-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sms-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  width: min(340px, 90vw);
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: 0 12px 32px rgb(0 0 0 / 18%);
}
.sms-group-label {
  padding: 8px 10px 4px;
  color: var(--muted);
  font-size: var(--ui-font-size-xs);
  letter-spacing: 0.04em;
}
.sms-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  font-size: var(--text-base);
  text-align: left;
  cursor: pointer;
}
.sms-item:hover {
  background: var(--hover, color-mix(in srgb, var(--fg) 6%, transparent));
}
.sms-item.selected {
  background: color-mix(in srgb, var(--accent, #3b82f6) 14%, transparent);
}
.sms-item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sms-dim {
  color: var(--muted);
}
.sms-check {
  flex: none;
  color: var(--accent, #3b82f6);
}
.sms-effort {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 8px 10px 4px;
  border-top: 1px solid var(--line);
}
.sms-effort.disabled {
  opacity: 0.55;
}
.sms-effort-label {
  flex: none;
  color: var(--muted);
  font-size: var(--ui-font-size-xs);
}
.sms-effort-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sms-effort-btn {
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--fg);
  font-size: var(--ui-font-size-xs);
  cursor: pointer;
}
.sms-effort-btn.active {
  border-color: var(--accent, #3b82f6);
  background: color-mix(in srgb, var(--accent, #3b82f6) 14%, transparent);
}
.sms-effort-btn:disabled {
  cursor: not-allowed;
}
</style>
