<script setup lang="ts">
/**
 * Composer —— 输入区(空闲单输入 / 运行双模 + 补全 + 弹层簇)
 *
 * 组件内行为(kimi3 域):
 * - `/` 与 `@` 补全检测,联动 SlashMenu / MentionMenu(选中回填 / 直接执行)
 * - ⌘+Enter 发送;运行态 stop = emit('cancel')
 * - placeholder 随 running/mode 切换;steer 模式 placeholder 染 warning 色
 *
 * 弹层簇(PermPicker / ModePicker / ContextMeter / ModelPicker)与补全菜单
 * (SlashMenu / MentionMenu)为独立组件,各自管理弹层开合与键盘导航。
 *
 * 契约外补充 props(已报备):builtin / skills / files —— 补全数据源,
 * 原型期由场景传入 mock,轮次 3 由 ZCode 的 composable 接真源。
 */
import { computed, ref, watch } from 'vue';
import type {
  BuiltinCommand,
  ComposerProps,
  ComposerEmits,
  FileEntry,
  Skill,
} from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';
import ComposerModes from './ComposerModes.vue';
import PermPicker from './PermPicker.vue';
import ModePicker from './ModePicker.vue';
import ContextMeter from './ContextMeter.vue';
import ModelPicker from './ModelPicker.vue';
import SlashMenu from './SlashMenu.vue';
import MentionMenu from './MentionMenu.vue';

const props = withDefaults(
  defineProps<
    ComposerProps & {
      builtin?: BuiltinCommand[];
      skills?: Skill[];
      files?: FileEntry[];
      sessionTitle?: string;
      placeholder?: string;
    }
  >(),
  { builtin: () => [], skills: () => [], files: () => [], sessionTitle: '', placeholder: '' },
);
const emit = defineEmits<ComposerEmits>();

const text = ref('');

/** 补全检测:'/' 开头单 token → slash;最后 token 以 @ 起头 → mention */
const assist = computed(() => {
  const v = text.value;
  const slash = v.match(/^\/(\w*)$/);
  if (slash) return { mode: 'slash' as const, query: (slash[1] ?? '').toLowerCase() };
  const at = v.match(/(?:^|\s)@([^\s@]*)$/);
  if (at) return { mode: 'at' as const, query: (at[1] ?? '').toLowerCase(), atStart: v.lastIndexOf('@') };
  return null;
});

/** Esc 关闭补全后,文本再变前抑制重开 */
const assistDismissed = ref(false);
watch(text, () => {
  assistDismissed.value = false;
});
const assistVisible = computed(() => (assistDismissed.value ? null : assist.value));
function closeAssist() {
  assistDismissed.value = true;
}

function onSlashSelect(cmd: BuiltinCommand | Skill) {
  const name = (cmd as BuiltinCommand).name ?? '';
  if ((cmd as BuiltinCommand).acceptsInput) {
    text.value = '/' + name + ' ';
  } else {
    /* 无参命令:原型期直接作为一条消息发出,模拟"直接执行" */
    emit('send', '/' + name, 'queue');
    text.value = '';
  }
}
function onAtSelect(file: FileEntry) {
  const a = assist.value;
  if (a?.mode === 'at') {
    text.value = text.value.slice(0, a.atStart) + '@' + file.path + ' ';
  }
}

const placeholder = computed(() => {
  if (props.placeholder) return props.placeholder;
  if (props.running && props.mode === 'steer') return '输入将立即插话到当前运行的轮次…';
  if (props.running) return '输入会排队 · 当前轮结束后自动发送下一条';
  return '给 Kimi 下达任务,⌘+Enter 发送';
});

const canSend = computed(() => text.value.trim().length > 0);

function submit() {
  if (!canSend.value) return;
  emit('send', text.value.trim(), props.mode);
  text.value = '';
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    submit();
  }
}
</script>

<template>
  <div
    class="composer"
    :class="{ 'is-running': props.running, 'mode-steer-on': props.mode === 'steer' }"
  >
    <SlashMenu
      v-if="assistVisible?.mode === 'slash'"
      :builtin="props.builtin"
      :skills="props.skills"
      :query="assistVisible.query"
      :skills-loading="false"
      @select="onSlashSelect"
      @close="closeAssist"
    />
    <MentionMenu
      v-if="assistVisible?.mode === 'at'"
      :files="props.files"
      :query="assistVisible.query"
      :files-loading="false"
      @select="onAtSelect"
      @close="closeAssist"
    />

    <ComposerModes v-if="props.running" :mode="props.mode" @set-mode="(m) => emit('set-mode', m)" />

    <div class="composer-input">
      <textarea
        v-model="text"
        rows="1"
        :placeholder="placeholder"
        @keydown="onKeydown"
      ></textarea>
    </div>

    <div class="composer-toolbar">
      <div class="toolbar-group">
        <PermPicker :permission="props.permission" @set-permission="(p) => emit('set-permission', p)" />
        <ModePicker :modes="props.modes" @toggle-mode="(m) => emit('toggle-mode', m)" />
      </div>
      <div class="toolbar-group right">
        <ContextMeter
          :context="props.context"
          :quota="props.quota"
          :session-title="props.sessionTitle"
          :running="props.running"
          :permission="props.permission"
          :model="props.currentModel"
          :effort="props.effort"
          @open-detail="emit('open-context-detail')"
        />
        <ModelPicker
          :models="props.models"
          :current="props.currentModel"
          :effort="props.effort"
          @set-model="(id) => emit('set-model', id)"
          @set-effort="(lv) => emit('set-effort', lv)"
        />
        <button
          v-if="!props.running"
          class="composer-send"
          :disabled="!canSend"
          title="发送 ⌘+Enter"
          @click="submit"
        >
          <CodexIcon name="arrow-up" />
        </button>
        <button v-else class="composer-send stop" title="中断" @click="emit('cancel')">
          <CodexIcon name="stop" />
        </button>
      </div>
    </div>
  </div>
</template>
