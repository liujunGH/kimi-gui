/**
 * useUpdater —— 应用自动更新(tauri-plugin-updater + GitHub Releases latest.json)
 *
 * 数据源:
 * - 清单:https://github.com/liujunGH/kimi-gui/releases/latest/download/latest.json
 *   (CI 发行工作流用签名私钥生成;公钥写在 tauri.conf.json plugins.updater.pubkey)
 * - 更新包:清单里指向的 .app.tar.gz,下载前做签名校验,防篡改
 *
 * 流程:checkForUpdate() 拉清单比对版本 → available 有值即弹 UpdateDialog;
 * downloadAndInstall() 带进度的下载 + 安装 + relaunch 重启完成更新。
 */
import { ref } from 'vue';

export interface UpdateInfo {
  version: string;
  notes: string;
}

const checking = ref(false);
const available = ref<UpdateInfo | null>(null);
const downloading = ref(false);
const progress = ref({ downloaded: 0, total: 0 });
const error = ref<string | null>(null);

/** 检查更新。silent=true 为启动静默检查(失败不报错);返回是否有新版本 */
async function checkForUpdate(silent = false): Promise<boolean> {
  if (checking.value) return false;
  checking.value = true;
  error.value = null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = await check();
    if (u) {
      available.value = { version: u.version, notes: u.body ?? '' };
      return true;
    }
    available.value = null;
    return false;
  } catch (e) {
    if (!silent) error.value = e instanceof Error ? e.message : String(e);
    return false;
  } finally {
    checking.value = false;
  }
}

/** 下载并安装,完成后自动重启应用 */
async function downloadAndInstall(): Promise<void> {
  if (!available.value || downloading.value) return;
  downloading.value = true;
  error.value = null;
  progress.value = { downloaded: 0, total: 0 };
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = await check();
    if (!u) {
      available.value = null;
      return;
    }
    await u.downloadAndInstall((ev) => {
      if (ev.event === 'Started') {
        progress.value = { downloaded: 0, total: ev.data.contentLength ?? 0 };
      } else if (ev.event === 'Progress') {
        progress.value = {
          downloaded: progress.value.downloaded + ev.data.chunkLength,
          total: progress.value.total,
        };
      }
    });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    downloading.value = false;
  }
}

function dismiss(): void {
  available.value = null;
}

export function useUpdater() {
  return { checking, available, downloading, progress, error, checkForUpdate, downloadAndInstall, dismiss };
}
