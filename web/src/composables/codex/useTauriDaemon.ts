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

// ---------------------------------------------------------------------------
// 计划额度(Rust PTY 抓取 CLI `/usage`,见 src-tauri/src/usage.rs)
// ---------------------------------------------------------------------------

/** 与 Rust PlanUsage 对齐;loading=true 表示后台正在抓,稍后重试。 */
export interface PlanUsage {
  weekly_pct: number;
  weekly_reset: string;
  hourly_pct: number;
  hourly_reset: string;
  fetched_at: number;
  loading?: boolean;
}

/**
 * 拉计划额度:invoke('plan_usage')。
 * - Tauri:返回 Rust 缓存(过期自动后台刷新;loading=true 表示首次抓取中)
 * - 浏览器:返回 null(调用方 fallback 到 sessionCost/占位)
 */
async function fetchPlanUsage(): Promise<PlanUsage | null> {
  if (!isTauriEnv()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<PlanUsage>('plan_usage');
  } catch {
    return null;
  }
}

/** 双击自定义标题栏 → 放大/还原窗口(Overlay 标题栏样式下由前端手动触发) */
async function toggleWindowZoom(): Promise<void> {
  if (!isTauriEnv()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('toggle_window_zoom');
  } catch {
    /* 忽略 */
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
    /** 计划额度(PTY 抓 /usage;浏览器返回 null) */
    fetchPlanUsage,
    /** 双击标题栏放大/还原窗口 */
    toggleWindowZoom,
  };
}
