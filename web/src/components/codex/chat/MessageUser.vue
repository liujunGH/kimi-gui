<script setup lang="ts">
/**
 * MessageUser —— 用户消息气泡(右对齐,中性灰)
 * 附件:气泡上方 chip 行(复用官方 chat/AttachmentChip,对齐 ChatPane);
 * 图片/视频点击开轻量灯箱(file 类型由 AttachmentChip 自行处理)。
 */
import { computed, onUnmounted, ref } from 'vue';
import type { ChatTurn, TurnAttachment } from '../../../types';
import AttachmentChip from '../../chat/AttachmentChip.vue';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<{ turn: ChatTurn }>();
const emit = defineEmits<{ (e: 'edit', turn: ChatTurn): void }>();

const meta = computed(() => {
  const t = props.turn.createdAt;
  return t ? t.slice(11, 16) : '';
});

/** 轻量灯箱:图片/视频附件点击放大查看 */
const preview = ref<TurnAttachment | null>(null);
function onActivate(att: TurnAttachment) {
  if (att.kind === 'image' || att.kind === 'video') preview.value = att;
}

/** 复制反馈:点完图标变 check,1 秒后还原 */
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function copyText() {
  try {
    if (navigator.clipboard) navigator.clipboard.writeText(props.turn.text);
  } catch {
    /* 忽略 */
  }
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 1000);
}
onUnmounted(() => clearTimeout(copyTimer));
</script>

<template>
  <div class="msg-user">
    <div v-if="props.turn.attachments?.length" class="u-atts">
      <AttachmentChip
        v-for="(att, ai) in props.turn.attachments"
        :key="ai"
        :kind="att.kind"
        :name="att.name"
        :url="att.url"
        :file-id="att.fileId"
        :media-type="att.mediaType"
        :size="att.size"
        @activate="onActivate(att)"
      />
    </div>
    <div v-if="props.turn.text" class="u-bubble">{{ props.turn.text }}</div>
    <div v-if="meta" class="u-meta">{{ meta }}</div>

    <!-- hover 操作行:复制 / 编辑重发(与 MessageAssistant 的 foot-copy 同一套视觉) -->
    <div v-if="props.turn.text" class="u-actions">
      <button
        type="button"
        class="icon-btn u-act"
        :title="copied ? '已复制' : '复制'"
        :aria-label="copied ? '已复制' : '复制'"
        @click="copyText"
      >
        <CodexIcon :name="copied ? 'check' : 'copy'" size="sm" />
      </button>
      <button
        type="button"
        class="icon-btn u-act"
        title="编辑重发"
        aria-label="编辑重发"
        @click="emit('edit', props.turn)"
      >
        <CodexIcon name="pencil" size="sm" />
      </button>
    </div>

    <div v-if="preview" class="u-lightbox" @click="preview = null">
      <img v-if="preview.kind === 'image'" :src="preview.url" :alt="preview.name ?? ''" />
      <video v-else :src="preview.url" controls autoplay />
    </div>
  </div>
</template>

<style scoped>
/* hover 操作行:右对齐(承 .msg-user 的 align-items:flex-end),24px icon-btn,
   hover / 键盘 focus-within 时显形(与 MessageAssistant 的 foot-copy 同一套视觉) */
.u-actions {
  display: flex; gap: 2px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity var(--dur-1);
}
.msg-user:hover .u-actions,
.msg-user:focus-within .u-actions { opacity: 1; }
.u-act { width: 24px; height: 24px; }
.u-act:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

.u-atts {
  display: flex; flex-wrap: wrap; gap: 6px;
  justify-content: flex-end;
  max-width: 76%;
  margin-bottom: 6px;
}
.u-lightbox {
  position: fixed; inset: 0; z-index: 80;
  display: grid; place-items: center;
  background: rgba(20, 23, 28, 0.62);
  cursor: zoom-out;
}
.u-lightbox img,
.u-lightbox video {
  max-width: 88vw; max-height: 88vh;
  border-radius: 8px;
}
</style>
