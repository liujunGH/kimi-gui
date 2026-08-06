<script setup lang="ts">
import CodexIcon from './CodexIcon.vue';

defineProps<{ idleMinutes: number; tokens: number }>();
const emit = defineEmits<{
  (e: 'choose', action: 'compact' | 'new' | 'continue' | 'never'): void;
}>();
</script>

<template>
  <div class="cache-overlay" role="presentation" @click.self="emit('choose', 'continue')">
    <section class="cache-dialog" role="dialog" aria-modal="true" aria-labelledby="cache-title" @keydown.esc="emit('choose', 'continue')">
      <div class="cache-icon"><CodexIcon name="info" /></div>
      <div>
        <h2 id="cache-title">这段上下文的服务端缓存可能已过期</h2>
        <p>会话已闲置约 {{ idleMinutes }} 分钟，当前上下文约 {{ tokens.toLocaleString() }} tokens。继续会保留完整历史，但下一次请求可能更慢、消耗更多输入额度。</p>
      </div>
      <div class="cache-actions">
        <button class="btn primary" autofocus @click="emit('choose', 'compact')">先压缩再继续</button>
        <button class="btn" @click="emit('choose', 'new')">在新任务继续</button>
        <button class="btn" @click="emit('choose', 'continue')">仍在当前任务继续</button>
        <button class="cache-never" @click="emit('choose', 'never')">不再提醒</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cache-overlay{position:fixed;inset:0;z-index:var(--z-modal);display:grid;place-items:center;background:color-mix(in srgb,var(--text) 28%,transparent)}
.cache-dialog{width:min(560px,calc(100vw - 32px));display:grid;grid-template-columns:42px 1fr;gap:16px;padding:24px;border:1px solid var(--border);border-radius:var(--r-xl);background:var(--bg);box-shadow:var(--shadow-lg);color:var(--text)}
.cache-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:var(--r-lg);background:var(--accent-soft);color:var(--accent)}
h2{font-size:18px;margin:1px 0 8px}p{margin:0;color:var(--text-2);font-size:14px;line-height:1.7}.cache-actions{grid-column:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}.cache-never{margin-left:auto;border:0;background:none;color:var(--text-3);cursor:pointer;padding:8px}.cache-never:hover{color:var(--text-1)}
@media(max-width:560px){.cache-dialog{grid-template-columns:1fr}.cache-icon,.cache-actions{grid-column:1}.cache-actions{align-items:stretch;flex-direction:column}.cache-never{margin-left:0}}
</style>
