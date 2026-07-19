<script setup lang="ts">
/**
 * SettingsPage —— 设置页(6 分类:通用/外观/权限/快捷键/归档管理/关于)
 *
 * 结构对齐 prototype/settings.html;样式类全部在 settings.css + base.css。
 * 组件内行为(翻译自 prototype/mock/shared.js bindSettingsNav):
 * - 左导航点击切换 section(active 类联动,无路由)
 * - 主题 seg 调 useTheme().set() 真实生效(浅色/深色直接切;跟随系统解析后切,
 *   useTheme 暂无 'system' 档与系统主题监听 —— 契约缺口,已报备)
 * - 其余控件为原型期展示,本地 ref 持有,轮次 3 接 daemon 持久化
 *
 * props:仅可选 initialSection(初始激活的分类)。
 * 归档预览为原型占位内容,轮次 3 需由外部传入真实归档列表(契约缺口,已报备)。
 */
import { ref } from 'vue';
import type { PermissionMode } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';
import { useTheme } from '../../../composables/codex/useTheme';

type SectionId = 'general' | 'appearance' | 'permissions' | 'shortcuts' | 'archive' | 'about';

const props = withDefaults(defineProps<{ initialSection?: SectionId }>(), {
  initialSection: 'general',
});

const NAV: { id: SectionId; label: string; icon: string }[] = [
  { id: 'general', label: '通用', icon: 'sliders' },
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'permissions', label: '权限', icon: 'shield' },
  { id: 'shortcuts', label: '快捷键', icon: 'keyboard' },
  { id: 'archive', label: '归档管理', icon: 'archive' },
  { id: 'about', label: '关于', icon: 'info' },
];

const active = ref<SectionId>(props.initialSection);

/* ---------- 通用(原型期展示,本地态) ---------- */
const permDefault = ref<PermissionMode>('manual');
const defaultModel = ref('K3');

/* ---------- 外观 ---------- */
type ThemeChoice = 'light' | 'dark' | 'system';
const { theme, set } = useTheme();
const themeChoice = ref<ThemeChoice>(theme.value);
function pickTheme(c: ThemeChoice) {
  themeChoice.value = c;
  if (c === 'system') {
    const dark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    set(dark ? 'dark' : 'light');
  } else {
    set(c);
  }
}
const fontSize = ref('标准');
const codeFont = ref('SF Mono');

/* ---------- 权限(原型期展示,本地态) ---------- */
const shellPerm = ref('逐条确认');
const filePerm = ref('逐条确认');
const netAccess = ref(true);
const dangerConfirm = ref(true);

/* ---------- 归档管理(原型期展示,本地态) ---------- */
const autoArchive = ref(false);
</script>

<template>
  <div class="settings">
    <div class="settings-inner">
      <h1 class="settings-title">设置</h1>
      <div class="settings-grid">
        <!-- 分类导航(组件内切换,无路由) -->
        <nav class="settings-nav">
          <a
            v-for="n in NAV"
            :key="n.id"
            :href="'#' + n.id"
            :data-section="n.id"
            :class="{ active: active === n.id }"
            @click.prevent="active = n.id"
          >
            <CodexIcon :name="n.icon" />
            {{ n.label }}
          </a>
        </nav>

        <!-- 设置内容 -->
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
                <select v-model="defaultModel" class="control">
                  <option>K3</option>
                  <option>K2.7 Coding</option>
                  <option>K2.7 Coding Highspeed</option>
                </select>
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
              </div>
              <div class="setting-control">
                <div class="seg">
                  <button
                    v-for="s in ['小', '标准', '大']"
                    :key="s"
                    :class="{ active: fontSize === s }"
                    @click="fontSize = s"
                  >
                    {{ s }}
                  </button>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">代码字体</div>
              </div>
              <div class="setting-control">
                <select v-model="codeFont" class="control">
                  <option>SF Mono</option>
                  <option>JetBrains Mono</option>
                  <option>Menlo</option>
                </select>
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
                <div class="setting-label">Shell 命令</div>
              </div>
              <div class="setting-control">
                <select v-model="shellPerm" class="control">
                  <option>逐条确认</option>
                  <option>本会话内自动</option>
                  <option>完全自动</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">文件修改</div>
              </div>
              <div class="setting-control">
                <select v-model="filePerm" class="control">
                  <option>逐条确认</option>
                  <option>本会话内自动</option>
                  <option>完全自动</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">网络访问</div>
                <div class="setting-desc">允许 agent 访问外网安装依赖</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="netAccess" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">危险命令额外确认</div>
                <div class="setting-desc">rm -rf、git push --force 等</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="dangerConfirm" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
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
              <div class="setting-info">
                <div class="setting-label">发送消息</div>
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
                <div class="setting-label">中断当前轮</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">Esc</span>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Review pane</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">⌘</span>
                  <span class="kbd">B</span>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Inspect</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">⌘</span>
                  <span class="kbd">I</span>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">搜索线程</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">⌘</span>
                  <span class="kbd">K</span>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">审批操作</div>
                <div class="setting-desc">批准 / 本会话 / 拒绝 / 反馈</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">Y</span>
                  <span class="kbd">A</span>
                  <span class="kbd">N</span>
                  <span class="kbd">P</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 归档管理 -->
          <section class="settings-section" :class="{ active: active === 'archive' }" id="archive">
            <h2>归档管理</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">归档工作区</div>
                <div class="setting-desc">3 个工作区</div>
              </div>
              <div class="setting-control">
                <button class="btn">查看</button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">归档对话</div>
                <div class="setting-desc">12 条</div>
              </div>
              <div class="setting-control">
                <button class="btn">查看</button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">自动归档</div>
                <div class="setting-desc">超过 30 天未活动自动归档</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="autoArchive" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>

            <!-- 最近归档预览(原型占位,轮次 3 接真源) -->
            <div class="archive-preview">
              <div class="ap-head">最近归档</div>
              <div class="archive-item">
                <span class="ai-icon"><CodexIcon name="archive" /></span>
                <div class="ai-info">
                  <div class="ai-name">旧版 React 客户端</div>
                  <div class="ai-meta">kimi-gui · 归档于 6 天前</div>
                </div>
                <button class="ai-restore">恢复</button>
              </div>
              <div class="archive-item">
                <span class="ai-icon"><CodexIcon name="archive" /></span>
                <div class="ai-info">
                  <div class="ai-name">实验性 TUI 界面</div>
                  <div class="ai-meta">my-api-server · 归档于 2 周前</div>
                </div>
                <button class="ai-restore">恢复</button>
              </div>
              <div class="archive-item">
                <span class="ai-icon"><CodexIcon name="archive" /></span>
                <div class="ai-info">
                  <div class="ai-name">首页 SEO 优化</div>
                  <div class="ai-meta">blog · 归档于 1 个月前</div>
                </div>
                <button class="ai-restore">恢复</button>
              </div>
              <a class="ap-footer" href="#archive" @click.prevent>查看全部 →</a>
            </div>
          </section>

          <!-- 关于 -->
          <section class="settings-section" :class="{ active: active === 'about' }" id="about">
            <h2>关于</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">版本</div>
              </div>
              <div class="setting-control">
                <span>0.1.0-prototype</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Daemon</div>
              </div>
              <div class="setting-control">
                <span>127.0.0.1:58627</span>
                <span class="pill pill-success"><span class="dot dot-done"></span>已连接</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">检查更新</div>
              </div>
              <div class="setting-control">
                <button class="btn">检查更新</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
