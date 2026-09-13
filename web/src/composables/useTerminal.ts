import { onUnmounted, ref, watch, type Ref } from 'vue';
import { getKimiWebApi } from '../api';
import type { AppTerminal, KimiEventConnection } from '../api/types';
import { kimiNativeAvailable } from './useKimiRuntime';
import { createLocalPty, type LocalPtyController } from './codex/useLocalPty';

export interface TerminalStartOptions {
  cols?: number;
  rows?: number;
  /** 本地 PTY 后端的起壳目录(会话工作区根)。daemon 后端忽略此参数。 */
  cwd?: string;
}

export function useTerminal(sessionId: Ref<string>) {
  const terminal = ref<AppTerminal | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const connected = ref(false);
  const readOnly = ref(false);
  const lastSeq = ref(0);

  const outputHandlers = new Set<(data: string) => void>();
  const exitHandlers = new Set<(exitCode: number | null) => void>();
  let conn: KimiEventConnection | null = null;

  // 双后端:桌面端用壳内本地 PTY(daemon 的 node-pty 在原生安装(Node SEA)
  // 下无法加载,terminal 能力结构性不可用);浏览器/沙箱走 daemon 契约。
  const localPty: LocalPtyController | null = kimiNativeAvailable() ? createLocalPty() : null;
  let disposeLocalOutput: (() => void) | null = null;
  let disposeLocalExit: (() => void) | null = null;

  function ensureConnection(): KimiEventConnection | null {
    if (conn !== null) return conn;
    if (typeof WebSocket === 'undefined') return null;
    conn = getKimiWebApi().connectEvents({
      onEvent: () => {},
      onResync: () => {},
      onError: (_code, msg) => {
        error.value = msg;
      },
      onConnectionChange: (state) => {
        connected.value = state;
      },
      onTerminalOutput: (sid, terminalId, data, seq) => {
        if (sid !== sessionId.value || terminal.value?.id !== terminalId) return;
        lastSeq.value = Math.max(lastSeq.value, seq);
        for (const handler of outputHandlers) handler(data);
      },
      onTerminalExit: (sid, terminalId, exitCode) => {
        if (sid !== sessionId.value || terminal.value?.id !== terminalId) return;
        readOnly.value = true;
        terminal.value = terminal.value
          ? { ...terminal.value, status: 'exited', exitCode }
          : terminal.value;
        for (const handler of exitHandlers) handler(exitCode);
      },
    });
    return conn;
  }

  async function startLocal(size?: TerminalStartOptions): Promise<void> {
    if (!localPty) return;
    disposeLocalOutput?.();
    disposeLocalExit?.();
    disposeLocalOutput = localPty.onOutput((data) => {
      for (const handler of outputHandlers) handler(data);
    });
    disposeLocalExit = localPty.onExit((exitCode) => {
      readOnly.value = true;
      connected.value = false;
      terminal.value = terminal.value
        ? { ...terminal.value, status: 'exited', exitCode }
        : terminal.value;
      for (const handler of exitHandlers) handler(exitCode);
    });
    const info = await localPty.start(size?.cwd ?? '', size?.cols ?? 80, size?.rows ?? 24);
    terminal.value = {
      id: `local-${info.id}`,
      sessionId: sessionId.value,
      cwd: info.cwd,
      shell: info.shell,
      cols: Math.max(1, size?.cols ?? 80),
      rows: Math.max(1, size?.rows ?? 24),
      status: 'running',
      createdAt: new Date().toISOString(),
    };
    connected.value = true;
  }

  async function startDaemon(size?: TerminalStartOptions): Promise<void> {
    const sid = sessionId.value;
    if (!sid) return;
    const api = getKimiWebApi();
    const existing = (await api.listTerminals(sid)).find((item) => item.status === 'running');
    const next = existing ?? await api.createTerminal(sid, {
      cols: size?.cols,
      rows: size?.rows,
    });
    terminal.value = next;
    readOnly.value = next.status === 'exited';
    ensureConnection()?.terminalAttach(sid, next.id, lastSeq.value);
  }

  async function start(size?: TerminalStartOptions): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      if (localPty) await startLocal(size);
      else await startDaemon(size);
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : String(error_);
    } finally {
      loading.value = false;
    }
  }

  function write(data: string): void {
    const current = terminal.value;
    if (!current || readOnly.value) return;
    if (localPty) {
      localPty.write(data);
      return;
    }
    ensureConnection()?.terminalInput(current.sessionId, current.id, data);
  }

  function resize(cols: number, rows: number): void {
    const current = terminal.value;
    if (!current || readOnly.value) return;
    if (localPty) {
      localPty.resize(cols, rows);
      return;
    }
    ensureConnection()?.terminalResize(current.sessionId, current.id, cols, rows);
  }

  async function close(): Promise<void> {
    const current = terminal.value;
    if (!current) return;
    readOnly.value = true;
    if (localPty) {
      localPty.kill();
      connected.value = false;
      terminal.value = { ...current, status: 'exited' };
      return;
    }
    try {
      ensureConnection()?.terminalClose(current.sessionId, current.id);
      await getKimiWebApi().closeTerminal(current.sessionId, current.id);
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : String(error_);
    }
  }

  function restart(size?: TerminalStartOptions): void {
    const current = terminal.value;
    if (current && !localPty) {
      conn?.terminalDetach(current.sessionId, current.id);
    }
    terminal.value = null;
    readOnly.value = false;
    lastSeq.value = 0;
    void start(size);
  }

  function onOutput(handler: (data: string) => void): () => void {
    outputHandlers.add(handler);
    return () => outputHandlers.delete(handler);
  }

  function onExit(handler: (exitCode: number | null) => void): () => void {
    exitHandlers.add(handler);
    return () => exitHandlers.delete(handler);
  }

  watch(sessionId, () => {
    const current = terminal.value;
    if (localPty) {
      localPty.kill();
      connected.value = false;
    } else if (current) {
      conn?.terminalDetach(current.sessionId, current.id);
    }
    terminal.value = null;
    readOnly.value = false;
    lastSeq.value = 0;
  });

  onUnmounted(() => {
    const current = terminal.value;
    if (localPty) {
      disposeLocalOutput?.();
      disposeLocalExit?.();
      localPty.dispose();
    } else if (current) {
      conn?.terminalDetach(current.sessionId, current.id);
    }
    conn?.close();
    conn = null;
  });

  return {
    terminal,
    loading,
    error,
    connected,
    readOnly,
    start,
    write,
    resize,
    close,
    restart,
    onOutput,
    onExit,
  };
}
