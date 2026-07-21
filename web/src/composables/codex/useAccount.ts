/**
 * useAccount —— Kimi 账号登录态 + OAuth 设备码流程
 *
 * 数据源(全走 daemon,不写死):
 * - POST   /oauth/login  开始登录(已登录时 ensureFresh 秒回 authenticated;
 *                        否则下发设备码 verification_uri_complete + user_code)
 * - GET    /oauth/login  轮询单例流程状态(pending/authenticated/expired/cancelled)
 * - DELETE /oauth/login  取消流程
 * - POST   /oauth/logout 退出登录
 * 授权页:桌面走 tauri opener 插件,浏览器 dev 退回 window.open。
 */
import { ref } from 'vue';
import { getKimiWebApi } from '../../api';
import { useToast } from '../../components/codex/layout/Toast.vue';

export interface OAuthPendingFlow {
  flowId: string;
  verificationUri: string;
  verificationUriComplete: string;
  userCode: string;
  interval: number;
}

const state = ref<'unknown' | 'authed' | 'unauthed'>('unknown');
const pendingFlow = ref<OAuthPendingFlow | null>(null);
const busy = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** 探测当前登录态(仅 unknown 时调用一次)
 *  用 startOAuthLogin 的 ensureFresh 快路径判态:已登录秒回 authenticated;
 *  未登录会下发挂起流程 → 立即取消,只取状态不留副作用。 */
async function probe(): Promise<void> {
  if (state.value !== 'unknown') return;
  try {
    const r = await getKimiWebApi().startOAuthLogin();
    if (r.status === 'authenticated') {
      state.value = 'authed';
    } else {
      state.value = 'unauthed';
      try {
        await getKimiWebApi().cancelOAuthLogin();
      } catch {
        /* ignore */
      }
    }
  } catch {
    state.value = 'unauthed';
  }
}

function startPolling(intervalSec: number) {
  stopPolling();
  const ms = Math.max(2, intervalSec || 3) * 1000;
  pollTimer = setInterval(async () => {
    try {
      const r = await getKimiWebApi().pollOAuthLogin();
      if (!r) return;
      if (r.status === 'authenticated') {
        state.value = 'authed';
        pendingFlow.value = null;
        stopPolling();
        useToast().toast('登录成功');
      } else if (r.status === 'expired' || r.status === 'cancelled') {
        pendingFlow.value = null;
        stopPolling();
      }
    } catch {
      /* 轮询继续,网络抖动不算失败 */
    }
  }, ms);
}

async function openAuthPage(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank');
  }
}

/** 点「登录」:已登录秒回;否则打开浏览器授权页 + 展示设备码卡,后台轮询到完成 */
async function startLogin(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await getKimiWebApi().startOAuthLogin();
    if (r.status === 'authenticated') {
      state.value = 'authed';
      useToast().toast('已登录');
      return;
    }
    pendingFlow.value = {
      flowId: r.flowId,
      verificationUri: r.verificationUri,
      verificationUriComplete: r.verificationUriComplete,
      userCode: r.userCode,
      interval: r.interval,
    };
    await openAuthPage(r.verificationUriComplete);
    startPolling(r.interval);
  } catch {
    useToast().toast('登录服务不可用');
  } finally {
    busy.value = false;
  }
}

async function cancelLogin(): Promise<void> {
  stopPolling();
  try {
    await getKimiWebApi().cancelOAuthLogin();
  } catch {
    /* best-effort */
  }
  pendingFlow.value = null;
}

function reopenAuthPage(): void {
  if (pendingFlow.value) void openAuthPage(pendingFlow.value.verificationUriComplete);
}

async function logout(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await getKimiWebApi().logout();
    state.value = 'unauthed';
    useToast().toast('已退出登录');
  } finally {
    busy.value = false;
  }
}

export function useAccount() {
  return { state, pendingFlow, busy, probe, startLogin, cancelLogin, reopenAuthPage, logout };
}
