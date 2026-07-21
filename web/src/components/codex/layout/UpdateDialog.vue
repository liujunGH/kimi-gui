<script setup lang="ts">
/**
 * UpdateDialog —— 新版本提示弹窗(发现新版本 → 中文功能描述 → 下载安装)
 *
 * 出现条件:useUpdater().available 非空(启动静默检查或设置页手动检查发现新版本)。
 * 「立即更新」:带进度下载 + 安装 + 自动重启;「以后再说」:关闭不再提示本次。
 */
import { computed } from 'vue';
import { useUpdater } from '../../../composables/codex/useUpdater';

const { available, downloading, progress, error, downloadAndInstall, dismiss } = useUpdater();

const pct = computed(() =>
  progress.value.total > 0 ? Math.min(100, Math.round((progress.value.downloaded / progress.value.total) * 100)) : 0,
);
const actionText = computed(() => {
  if (!downloading.value) return '立即更新';
  if (progress.value.total > 0 && pct.value < 100) return `下载中 ${pct.value}%`;
  return '安装中…';
});
</script>

<template>
  <Teleport to="body">
    <div v-if="available" class="login-overlay open">
      <div class="login-card update-card">
        <span class="login-logo">K</span>
        <div class="login-title">发现新版本 v{{ available.version }}</div>
        <div v-if="available.notes" class="update-notes">{{ available.notes }}</div>
        <div v-if="downloading" class="update-progress">
          <div class="update-progress-bar" :style="{ width: pct + '%' }"></div>
        </div>
        <div v-if="error" class="update-error">{{ error }}</div>
        <button class="login-btn" :disabled="downloading" @click="downloadAndInstall">
          {{ actionText }}
        </button>
        <button class="login-cancel" :disabled="downloading" @click="dismiss">以后再说</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.update-card { text-align: left; }
.update-card .login-title { text-align: center; }
.update-notes {
  margin-top: 14px;
  max-height: 220px;
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--bg-soft);
  font-size: var(--text-sm);
  line-height: 1.65;
  color: var(--text-2);
  white-space: pre-wrap;
}
.update-progress {
  margin-top: 14px;
  height: 4px;
  border-radius: var(--r-full);
  background: var(--bg-soft);
  overflow: hidden;
}
.update-progress-bar {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.2s ease;
}
.update-error { margin-top: 10px; font-size: var(--text-sm); color: var(--danger); }
</style>
