<script setup lang="ts">
import { computed } from 'vue';
import CodexIcon from '../layout/CodexIcon.vue';
const props = defineProps<{ runtimeVersion?: string }>();
defineEmits<{ (e: 'manage'): void }>();

const platform = typeof navigator === 'undefined' ? '' : navigator.platform.toLowerCase();
const isMac = platform.includes('mac');
const runtimeLabel = computed(() => props.runtimeVersion ? `Kimi Code ${props.runtimeVersion}` : '当前 Kimi Code');
</script>

<template>
  <div class="capabilities-settings">
    <div class="cap-hero">
      <span><CodexIcon name="sparkle" /></span>
      <div><strong>Capabilities 是插件提供给 Agent 的运行能力</strong><p>GUI 使用官方 Kimi Code 插件管理交互，安装状态、平台检查和依赖提示都由 {{ runtimeLabel }} 的官方管理器处理，避免复制一套容易失真的安装逻辑。</p></div>
      <button class="btn primary" @click="$emit('manage')">在应用内管理</button>
    </div>
    <div class="cap-grid">
      <article>
        <div class="cap-head"><CodexIcon name="apps" /><strong>Kimi WebBridge</strong><span class="pill">官方</span></div>
        <p>为 Agent 提供浏览器页面读取与交互能力。是否可安装、所需依赖和当前状态以官方管理器为准。</p>
        <small>适合网页调试、资料提取和需要登录态的浏览器任务。</small>
      </article>
      <article>
        <div class="cap-head"><CodexIcon name="panel-right" /><strong>Computer Use</strong><span class="pill">{{ isMac ? 'macOS' : '按平台' }}</span></div>
        <p>让 Agent 操作桌面界面。官方管理器会根据操作系统显示兼容性与安装步骤。</p>
        <small>高影响操作仍受当前权限模式和审批规则控制。</small>
      </article>
    </div>
    <div class="settings-callout subtle">当前 daemon 公共 REST 契约没有独立的 Capabilities 管理端点，因此这里不伪造“已安装”状态；点击管理会在 GUI 内打开官方 /plugins 交互，并直接操作真实配置。</div>
  </div>
</template>

<style scoped>
.capabilities-settings{display:grid;gap:14px}.cap-hero{display:grid;grid-template-columns:42px 1fr auto;gap:14px;align-items:center;padding:16px;border:1px solid var(--accent-bd);border-radius:var(--r-xl);background:var(--accent-soft)}.cap-hero>span{display:grid;place-items:center;width:42px;height:42px;border-radius:var(--r-lg);background:var(--bg);color:var(--accent)}.cap-hero strong{font-size:14px}.cap-hero p,.cap-grid p{margin:5px 0 0;color:var(--text-2);font-size:12px;line-height:1.6}.cap-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cap-grid article{padding:16px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-soft)}.cap-head{display:flex;align-items:center;gap:8px}.cap-head .pill{margin-left:auto}.cap-grid small{display:block;margin-top:12px;color:var(--text-3);line-height:1.5}@media(max-width:760px){.cap-hero{grid-template-columns:42px 1fr}.cap-hero button{grid-column:1/3}.cap-grid{grid-template-columns:1fr}}
</style>
