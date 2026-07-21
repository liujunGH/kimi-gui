<script setup lang="ts">
/**
 * AccountRow —— 侧栏底部账号行 + OAuth 设备码登录
 * - 已登录:头像 K +「已登录」,点开菜单 → 退出登录(POST /oauth/logout)
 * - 未登录:灰头像 +「未登录」,点击直接发起设备码登录(浏览器授权 + 弹设备码卡)
 * 状态与流程在 composables/codex/useAccount.ts(模块单例)。
 */
import { computed, onMounted, ref } from 'vue';
import CodexIcon from '../layout/CodexIcon.vue';
import { useAccount } from '../../../composables/codex/useAccount';

const { state, pendingFlow, probe, startLogin, cancelLogin, reopenAuthPage, logout } = useAccount();
const menuOpen = ref(false);

onMounted(() => {
  void probe();
});

const isAuthed = computed(() => state.value === 'authed');

function onRowClick() {
  if (!isAuthed.value) {
    void startLogin();
    return;
  }
  menuOpen.value = !menuOpen.value;
}
async function onLogout() {
  menuOpen.value = false;
  await logout();
}
</script>

<template>
  <div v-if="menuOpen" class="acct-backdrop" @click="menuOpen = false"></div>
  <div class="acct-wrap">
    <div v-if="menuOpen && isAuthed" class="acct-menu">
      <button class="menu-item" @click="onLogout">
        <span class="mi-ic"><CodexIcon name="external" /></span>
        <span class="mi-label">退出登录</span>
      </button>
    </div>
    <button class="acct-row" :title="isAuthed ? '账号' : '登录 Kimi 账号'" @click="onRowClick">
      <span class="acct-avatar" :class="{ out: !isAuthed }">
        <template v-if="isAuthed">K</template>
        <CodexIcon v-else name="user" />
      </span>
      <span class="acct-name">{{ isAuthed ? '已登录' : '未登录' }}</span>
      <span class="acct-caret"><CodexIcon name="chevron-up" size="sm" /></span>
    </button>
  </div>

  <!-- 设备码授权卡(轮询到授权完成自动关闭) -->
  <Teleport to="body">
    <div v-if="pendingFlow" class="login-overlay open" @click.self="cancelLogin">
      <div class="login-card">
        <span class="login-logo">K</span>
        <div class="login-title">登录 Kimi Code</div>
        <div class="login-desc">已在浏览器打开授权页<br />完成授权后此处自动完成登录</div>
        <div class="login-code" title="设备码">{{ pendingFlow.userCode }}</div>
        <button class="login-btn" @click="reopenAuthPage">再次打开授权页</button>
        <button class="login-cancel" @click="cancelLogin">取消</button>
      </div>
    </div>
  </Teleport>
</template>
