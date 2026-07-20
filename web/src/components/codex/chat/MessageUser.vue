<script setup lang="ts">
/**
 * MessageUser —— 用户消息气泡(右对齐,中性灰)
 * 附件:气泡上方 chip 行(复用官方 chat/AttachmentChip,对齐 ChatPane);
 * 图片/视频点击开轻量灯箱(file 类型由 AttachmentChip 自行处理)。
 */
import { computed, ref } from 'vue';
import type { ChatTurn, TurnAttachment } from '../../../types';
import AttachmentChip from '../../chat/AttachmentChip.vue';

const props = defineProps<{ turn: ChatTurn }>();

const meta = computed(() => {
  const t = props.turn.createdAt;
  return t ? t.slice(11, 16) : '';
});

/** 轻量灯箱:图片/视频附件点击放大查看 */
const preview = ref<TurnAttachment | null>(null);
function onActivate(att: TurnAttachment) {
  if (att.kind === 'image' || att.kind === 'video') preview.value = att;
}
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

    <div v-if="preview" class="u-lightbox" @click="preview = null">
      <img v-if="preview.kind === 'image'" :src="preview.url" :alt="preview.name ?? ''" />
      <video v-else :src="preview.url" controls autoplay />
    </div>
  </div>
</template>

<style scoped>
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
