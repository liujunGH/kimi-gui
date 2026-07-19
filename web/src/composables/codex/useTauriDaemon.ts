/**
 * useTauriDaemon —— Tauri daemon_info 命令的桥
 *
 * 职责:
 * - 在 Tauri 桌面环境:invoke('daemon_info') 拿 base URL + token
 * - 在纯浏览器(开发测试):返回 fallback,让调用方知道没 Tauri(用 mock)
 *
 * 这层是 codex UI 与 Tauri 之间的唯一边界。其他 composable / 组件不直接调
 * @tauri-apps/api,统一走这里。
 *
 * 安全约束:
 * - token 只暴露给调用方,不写 localStorage / 不打印 console
 * - 调用方拿到后立即注入到 useKimiWebClient(不持久化)
 */
import { ref } from 'vue';

export interface DaemonInfo {
  /** `http://127.0.0.1:58627`(不含 query) */
  base: string;
  /** daemon bearer token */
  token: string;
}

const daemonInfo = ref<DaemonInfo | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

/** 是否在 Tauri 桌面环境(判断 @tauri-apps/api 是否可用) */
function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 拉取 daemon 连接信息。
 * - Tauri 环境:invoke('daemon_info')
 * - 浏览器环境:抛 'no-tauri'(调用方决定 fallback)
 *
 * 幂等:已成功拉过则直接返回缓存,不重复调。
 */
async function fetchDaemonInfo(force = false): Promise<DaemonInfo | null> {
  if (daemonInfo.value && !force) return daemonInfo.value;
  if (!isTauriEnv()) {
    error.value = 'no-tauri';
    return null;
  }
  loading.value = true;
  error.value = null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<DaemonInfo>('daemon_info');
    daemonInfo.value = info;
    return info;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    return null;
  } finally {
    loading.value = false;
  }
}

export function useTauriDaemon() {
  return {
    /** 当前 daemon 信息(成功后非 null) */
    daemonInfo,
    /** 是否在拉取中 */
    loading,
    /** 错误信息;'no-tauri' = 浏览器环境无 Tauri */
    error,
    /** 是否在 Tauri 桌面环境 */
    isTauri: isTauriEnv,
    /** 拉取(幂等,可重复调) */
    fetch: fetchDaemonInfo,
  };
}
