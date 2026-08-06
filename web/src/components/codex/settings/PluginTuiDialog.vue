<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import type { FitAddon as FitAddonType } from '@xterm/addon-fit';
import type { ITheme, Terminal as XTerm } from '@xterm/xterm';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useIsDark } from '../../../composables/useIsDark';
import { kimiRuntime } from '../../../composables/useKimiRuntime';

const emit = defineEmits<{ (event: 'close'): void }>();
const props = defineProps<{ workspaceRoot: string; runtimeVersion?: string }>();

const TERMINAL_FONT =
  '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const hostRef = ref<HTMLElement | null>(null);
const loading = ref(true);
const running = ref(false);
const restarting = ref(false);
const error = ref('');
const pid = ref<number>();
const terminalFocused = ref(false);
const isDark = useIsDark();

let terminal: XTerm | null = null;
let fitAddon: FitAddonType | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let polling = false;
let disposed = false;
let inputQueue = '';
let inputTimer: ReturnType<typeof setTimeout> | null = null;

const theme = computed<ITheme>(() =>
  isDark.value
    ? {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#7aa2ff',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#f2cc60',
        blue: '#7aa2ff',
        magenta: '#d2a8ff',
        cyan: '#76e3ea',
        white: '#e6edf3',
      }
    : {
        background: '#ffffff',
        foreground: '#1f2328',
        cursor: '#0969da',
        selectionBackground: '#c8e1ff',
        black: '#24292f',
        red: '#cf222e',
        green: '#116329',
        yellow: '#9a6700',
        blue: '#0969da',
        magenta: '#8250df',
        cyan: '#1b7c83',
        white: '#f6f8fa',
      },
);

function flushInput(): void {
  inputTimer = null;
  const data = inputQueue;
  inputQueue = '';
  if (!data || !running.value) return;
  void kimiRuntime.writePluginTui(data).catch((reason) => {
    error.value = reason instanceof Error ? reason.message : '无法写入插件管理器';
  });
}

function queueInput(data: string): void {
  inputQueue += data;
  if (inputTimer === null) inputTimer = setTimeout(flushInput, 8);
}

function focusTerminal(): void {
  terminal?.focus();
}

function onTerminalFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !hostRef.value?.contains(next)) terminalFocused.value = false;
}

function fitAndResize(): void {
  if (!terminal || !fitAddon || !hostRef.value) return;
  if (hostRef.value.clientWidth < 40 || hostRef.value.clientHeight < 40) return;
  try {
    fitAddon.fit();
    if (running.value) {
      void kimiRuntime.resizePluginTui(terminal.cols, terminal.rows).catch(() => undefined);
    }
  } catch {
    // The observer retries after the dialog layout has settled.
  }
}

function scheduleFit(): void {
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    fitAndResize();
  }, 80);
}

async function pollOutput(): Promise<void> {
  if (polling || disposed) return;
  polling = true;
  try {
    const snapshot = await kimiRuntime.readPluginTui();
    if (snapshot.output) terminal?.write(snapshot.output);
    running.value = snapshot.running;
    pid.value = snapshot.pid;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法读取插件管理器输出';
  } finally {
    polling = false;
  }
}

async function start(): Promise<void> {
  if (!terminal) return;
  loading.value = true;
  error.value = '';
  try {
    fitAndResize();
    const snapshot = await kimiRuntime.startPluginTui(props.workspaceRoot, terminal.cols, terminal.rows);
    running.value = snapshot.running;
    pid.value = snapshot.pid;
    if (snapshot.output) terminal.write(snapshot.output);
    pollTimer = setInterval(() => void pollOutput(), 40);
    terminal.focus();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Kimi 插件管理器启动失败';
  } finally {
    loading.value = false;
  }
}

async function restart(): Promise<void> {
  if (restarting.value) return;
  restarting.value = true;
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = null;
  try {
    await kimiRuntime.stopPluginTui();
    terminal?.reset();
    await start();
  } finally {
    restarting.value = false;
  }
}

async function reopenPlugins(): Promise<void> {
  error.value = '';
  try {
    await kimiRuntime.openPluginTui();
    terminal?.focus();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法重新打开 /plugins';
  }
}

async function close(): Promise<void> {
  disposed = true;
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = null;
  await kimiRuntime.stopPluginTui().catch(() => undefined);
  emit('close');
}

async function init(): Promise<void> {
  if (!hostRef.value) return;
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]);
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  if (disposed || !hostRef.value) return;
  const nextTerminal = new Terminal({
    allowProposedApi: false,
    cursorBlink: true,
    fontFamily: TERMINAL_FONT,
    fontSize: 13,
    lineHeight: 1.15,
    scrollback: 1_000,
    theme: theme.value,
  });
  const nextFitAddon = new FitAddon();
  nextTerminal.loadAddon(nextFitAddon);
  nextTerminal.open(hostRef.value);
  nextTerminal.onData(queueInput);
  terminal = nextTerminal;
  fitAddon = nextFitAddon;
  resizeObserver = new ResizeObserver(scheduleFit);
  resizeObserver.observe(hostRef.value);
  await nextTick();
  fitAndResize();
  await start();
}

onMounted(() => void init());

watch(theme, (nextTheme) => {
  if (terminal) terminal.options.theme = nextTheme;
});

onUnmounted(() => {
  disposed = true;
  if (pollTimer !== null) clearInterval(pollTimer);
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  if (inputTimer !== null) clearTimeout(inputTimer);
  resizeObserver?.disconnect();
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
  void kimiRuntime.stopPluginTui().catch(() => undefined);
});
</script>

<template>
  <div class="plugin-tui-backdrop" role="presentation">
    <section class="plugin-tui-dialog" role="dialog" aria-modal="true" aria-labelledby="plugin-tui-title">
      <header class="plugin-tui-header">
        <div>
          <div class="plugin-tui-eyebrow">Kimi Code{{ props.runtimeVersion ? ` ${props.runtimeVersion}` : '' }}</div>
          <h2 id="plugin-tui-title">官方插件管理器</h2>
          <p>完整支持安装、市场、启停、MCP 开关、删除与重载；操作直接写入 Kimi 的官方插件状态。</p>
        </div>
        <div class="plugin-tui-actions">
          <button class="btn" :disabled="loading || !running" @click="reopenPlugins">重新打开 /plugins</button>
          <button class="btn" :disabled="loading || restarting" @click="restart">{{ restarting ? '重启中…' : '重启终端' }}</button>
          <button class="btn" :disabled="loading || !running" @click="focusTerminal">聚焦终端</button>
          <button class="btn primary" @click="close">完成</button>
        </div>
      </header>
      <div class="plugin-tui-status">
        <span class="plugin-tui-dot" :class="{ running }"></span>
        <span>{{ loading ? '正在启动…' : running ? '已连接到本机 Kimi CLI' : '进程已退出' }}</span>
        <span v-if="pid" class="plugin-tui-pid">PID {{ pid }}</span>
        <span class="plugin-tui-focus" :class="{ active: terminalFocused }">{{ terminalFocused ? '键盘已就绪' : '点击终端以继续' }}</span>
        <span class="plugin-tui-hint">Tab 切换 · ↑↓ 选择 · Enter 打开 · Esc 返回</span>
      </div>
      <div class="plugin-tui-surface" @click="focusTerminal">
        <div ref="hostRef" class="plugin-tui-host" @focusin="terminalFocused = true" @focusout="onTerminalFocusOut"></div>
        <div v-if="loading" class="plugin-tui-overlay">正在载入官方插件管理器…</div>
        <div v-else-if="error" class="plugin-tui-overlay error">
          <strong>插件管理器暂时不可用</strong>
          <span>{{ error }}</span>
          <button class="btn" @click="restart">重试</button>
        </div>
        <div v-else-if="!running" class="plugin-tui-overlay">
          <strong>插件管理器已经退出</strong>
          <button class="btn" @click="restart">重新启动</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.plugin-tui-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 28px;
  background: color-mix(in srgb, var(--text) 56%, transparent);
}
.plugin-tui-dialog {
  width: min(1180px, calc(100vw - 56px));
  height: min(780px, calc(100vh - 56px));
  min-height: 520px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--bg);
  box-shadow: 0 28px 80px rgb(0 0 0 / 32%);
}
.plugin-tui-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--border);
}
.plugin-tui-header h2 {
  margin: 3px 0 4px;
  font-size: 18px;
}
.plugin-tui-header p {
  max-width: 690px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.plugin-tui-eyebrow {
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.plugin-tui-actions {
  display: flex;
  flex: none;
  gap: 8px;
}
.plugin-tui-status {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
}
.plugin-tui-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.plugin-tui-dot.running {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--success-soft);
}
.plugin-tui-pid {
  font-family: var(--mono);
  color: var(--text-tertiary);
}
.plugin-tui-hint {
  margin-left: auto;
}
.plugin-tui-focus {
  color: var(--warning);
}
.plugin-tui-focus.active {
  color: var(--success);
}
.plugin-tui-surface {
  position: relative;
  min-height: 0;
  flex: 1;
  padding: 10px;
  background: v-bind('theme.background');
}
.plugin-tui-host {
  width: 100%;
  height: 100%;
}
.plugin-tui-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--bg) 86%, transparent);
}
.plugin-tui-overlay.error {
  color: var(--danger);
}
@media (max-width: 760px) {
  .plugin-tui-backdrop { padding: 12px; }
  .plugin-tui-dialog { width: calc(100vw - 24px); height: calc(100vh - 24px); min-height: 420px; }
  .plugin-tui-header { flex-direction: column; }
  .plugin-tui-actions { width: 100%; flex-wrap: wrap; }
  .plugin-tui-hint { display: none; }
}
</style>
