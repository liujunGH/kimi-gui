<script setup lang="ts">
/**
 * SettingsPage —— 设置页(6 分类:通用/外观/权限/快捷键/归档管理/关于)
 *
 * 轮次 4e:接通 client 配置(权限/模型/字号/通知/归档)
 * 替代原型期的本地 ref 占位。
 */
import { computed, onMounted, ref } from 'vue';
import type { PermissionMode } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';
import { useTheme } from '../../../composables/codex/useTheme';
import { useKimiClient } from '../../../composables/codex/useKimiClient';

type SectionId = 'general' | 'appearance' | 'permissions' | 'shortcuts' | 'archive' | 'about';

const props = withDefaults(defineProps<{ initialSection?: SectionId }>(), {
  initialSection: 'general',
});

const client = useKimiClient();

const NAV: { id: SectionId; label: string; icon: string }[] = [
  { id: 'general', label: '通用', icon: 'sliders' },
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'permissions', label: '权限', icon: 'shield' },
  { id: 'shortcuts', label: '快捷键', icon: 'keyboard' },
  { id: 'archive', label: '归档管理', icon: 'archive' },
  { id: 'about', label: '关于', icon: 'info' },
];

const active = ref<SectionId>(props.initialSection);

/* ---------- 通用 ---------- */
// 权限默认值:读 client.permission,写 client.setPermission
const permDefault = computed<PermissionMode>({
  get: () => client.permission.value ?? 'manual',
  set: (v) => void client.setPermission(v),
});

// 默认模型:读 client.models + defaultModel,写 client.setModel
const modelOptions = computed(() =>
  (client.models.value ?? []).map((m: any) => ({
    id: m.id,
    name: m.displayName ?? m.model ?? m.id,
  })),
);
const defaultModelId = computed<string>({
  get: () => client.defaultModel.value ?? '',
  set: (v) => void client.setModel(v),
});

// 通知开关
const notifyComplete = computed<boolean>({
  get: () => client.notifyOnComplete.value ?? false,
  set: (v) => client.setNotifyOnComplete(v),
});
const notifyQuestion = computed<boolean>({
  get: () => client.notifyOnQuestion.value ?? false,
  set: (v) => client.setNotifyOnQuestion(v),
});
const notifyApproval = computed<boolean>({
  get: () => client.notifyOnApproval.value ?? false,
  set: (v) => client.setNotifyOnApproval(v),
});
const soundComplete = computed<boolean>({
  get: () => client.soundOnComplete.value ?? false,
  set: (v) => client.setSoundOnComplete(v),
});

/* ---------- 外观 ---------- */
type ThemeChoice = 'light' | 'dark' | 'system';
const { theme, set } = useTheme();
const themeChoice = ref<ThemeChoice>(theme.value);
function pickTheme(c: ThemeChoice) {
  themeChoice.value = c;
  set(c as any);
}

const fontSize = computed<string>({
  get: () => String(client.uiFontSize.value ?? 14) + 'px',
  set: (v) => client.setUiFontSize(Number(v.replace('px', '')) || 14),
});
function setFontSize(px: number) {
  client.setUiFontSize(px);
}

/* ---------- 权限(详细) ---------- */

/* ---------- 归档 ---------- */
const archivedSessions = ref<any[]>([]);
/** 应用版本(构建期注入,单一来源 tauri.conf.json) */
const appVersion = __APP_VERSION__;
const archivedLoading = ref(false);
async function loadArchive() {
  archivedLoading.value = true;
  try {
    const res: any = await client.loadArchivedSessions();
    archivedSessions.value = res?.items ?? res ?? [];
  } catch {
    /* ignore */
  } finally {
    archivedLoading.value = false;
  }
}
/** 恢复归档会话(返回成功则移出列表) */
async function onRestore(id: string) {
  const ok = await client.restoreSession(id);
  if (ok) archivedSessions.value = archivedSessions.value.filter((s: any) => s.id !== id);
}
onMounted(() => void loadArchive());


</script>

<template>
  <div class="settings">
    <div class="settings-inner">
      <h1 class="settings-title">设置</h1>
      <div class="settings-grid">
        <nav class="settings-nav">
          <a
            v-for="n in NAV"
            :key="n.id"
            :href="'#' + n.id"
            :class="{ active: active === n.id }"
            @click.prevent="active = n.id"
          >
            <CodexIcon :name="n.icon" />
            {{ n.label }}
          </a>
        </nav>

        <div class="settings-content">
          <!-- 通用 -->
          <section class="settings-section" :class="{ active: active === 'general' }" id="general">
            <h2>通用</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认权限模式</div>
              </div>
              <div class="setting-control">
                <select v-model="permDefault" class="control">
                  <option value="manual">逐条确认</option>
                  <option value="auto">自动通过</option>
                  <option value="yolo">完全自主</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">发送快捷键</div>
                <div class="setting-desc">Enter 单独按下为换行</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">⌘</span>
                  <span class="kbd">Enter</span>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认模型</div>
              </div>
              <div class="setting-control">
                <select v-model="defaultModelId" class="control">
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">完成时通知</div>
                <div class="setting-desc">agent 完成任务后发送系统通知</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="notifyComplete" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">提问时通知</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="notifyQuestion" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">审批时通知</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="notifyApproval" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">完成时播放声音</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="soundComplete" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <!-- 外观 -->
          <section
            class="settings-section"
            :class="{ active: active === 'appearance' }"
            id="appearance"
          >
            <h2>外观</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">主题</div>
              </div>
              <div class="setting-control">
                <div class="seg">
                  <button :class="{ active: themeChoice === 'light' }" @click="pickTheme('light')">
                    浅色
                  </button>
                  <button :class="{ active: themeChoice === 'dark' }" @click="pickTheme('dark')">
                    深色
                  </button>
                  <button :class="{ active: themeChoice === 'system' }" @click="pickTheme('system')">
                    跟随系统
                  </button>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">界面字号</div>
                <div class="setting-desc">当前: {{ fontSize }}</div>
              </div>
              <div class="setting-control">
                <div class="seg">
                  <button @click="setFontSize(13)">小</button>
                  <button @click="setFontSize(14)">标准</button>
                  <button @click="setFontSize(16)">大</button>
                </div>
              </div>
            </div>
          </section>

          <!-- 权限 -->
          <section
            class="settings-section"
            :class="{ active: active === 'permissions' }"
            id="permissions"
          >
            <h2>权限</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">当前会话权限</div>
                <div class="setting-desc">{{ permDefault }}</div>
              </div>
              <div class="setting-control">
                <select v-model="permDefault" class="control">
                  <option value="manual">逐条确认</option>
                  <option value="auto">自动通过</option>
                  <option value="yolo">完全自主</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">网络访问</div>
                <div class="setting-desc">由 daemon 权限模式控制(manual/auto/yolo)</div>
              </div>
              <div class="setting-control">
                <span class="pill">跟随权限模式</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">危险命令额外确认</div>
                <div class="setting-desc">rm -rf、git push --force 等始终需要确认</div>
              </div>
              <div class="setting-control">
                <span class="pill pill-success">已启用</span>
              </div>
            </div>
          </section>

          <!-- 快捷键 -->
          <section
            class="settings-section"
            :class="{ active: active === 'shortcuts' }"
            id="shortcuts"
          >
            <h2>快捷键</h2>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">发送消息</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">Enter</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">中断当前轮</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">Esc</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">Review pane</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">B</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">Inspect</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">I</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">侧边任务</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌥</span><span class="kbd">⌘</span><span class="kbd">S</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">全局唤起</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">⌥</span><span class="kbd">N</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">审批操作</div>
                <div class="setting-desc">批准 / 本会话 / 拒绝 / 反馈</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">Y</span><span class="kbd">A</span><span class="kbd">N</span><span class="kbd">P</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 归档管理 -->
          <section class="settings-section" :class="{ active: active === 'archive' }" id="archive">
            <h2>归档管理</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">已归档对话</div>
                <div class="setting-desc">{{ archivedSessions.length }} 条</div>
              </div>
              <div class="setting-control">
                <button class="btn" @click="loadArchive" :disabled="archivedLoading">
                  {{ archivedLoading ? '加载中…' : '刷新' }}
                </button>
              </div>
            </div>

            <div v-if="archivedSessions.length" class="archive-preview">
              <div class="ap-head">归档列表</div>
              <div v-for="s in archivedSessions" :key="s.id" class="archive-item">
                <span class="ai-icon"><CodexIcon name="archive" /></span>
                <div class="ai-info">
                  <div class="ai-name">{{ s.title || s.id }}</div>
                  <div class="ai-meta">归档于 {{ s.archivedAt?.slice(0, 10) ?? '未知' }}</div>
                </div>
                <button class="ai-restore" @click="onRestore(s.id)">恢复</button>
              </div>
            </div>
            <div v-else-if="!archivedLoading" class="archive-empty">暂无归档对话</div>
          </section>

          <!-- 关于 -->
          <section class="settings-section" :class="{ active: active === 'about' }" id="about">
            <h2>关于</h2>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">版本</div></div>
              <div class="setting-control"><span>Kimi Code v{{ appVersion }}</span></div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">Daemon</div></div>
              <div class="setting-control">
                <span>{{ client.connection.value === 'connected' ? '已连接' : '未连接' }}</span>
                <span v-if="client.serverVersion.value" class="pill">{{ client.serverVersion.value }}</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">模型引擎</div>
              </div>
              <div class="setting-control">
                <span>{{ client.backend.value ?? '—' }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
