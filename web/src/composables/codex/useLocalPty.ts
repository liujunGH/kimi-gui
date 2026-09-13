// 桌面端终端抽屉的本地 PTY 后端(Rust 壳 src-tauri/src/pty.rs)。
//
// daemon 的 terminal 能力依赖 node-pty,原生安装的 daemon 是 Node SEA 单文件,
// 无法从磁盘加载原生模块(ERR_UNKNOWN_BUILTIN_MODULE),该路径结构性不可用;
// 桌面端由壳直接提供 PTY。@tauri-apps/api 走动态导入,浏览器(沙箱/纯 web)
// 不加载该模块——daemon 后端见 useTerminal.ts。

export interface LocalPtySession {
  id: number;
  shell: string;
  cwd: string;
}

export interface LocalPtyController {
  start(cwd: string, cols: number, rows: number): Promise<LocalPtySession>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onOutput(handler: (data: string) => void): () => void;
  onExit(handler: (code: number | null) => void): () => void;
  /** 终端组件卸载时调用:杀进程 + 解绑事件监听。 */
  dispose(): void;
}

export function createLocalPty(): LocalPtyController {
  let currentId: number | null = null;
  let starting = false;
  const outputHandlers = new Set<(data: string) => void>();
  const exitHandlers = new Set<(code: number | null) => void>();
  const unlisteners: Array<() => void> = [];
  // 监听器先于 pty_create 注册(壳在 create 之后才会发事件),按 id 过滤。
  let bridgeReady: Promise<void> | null = null;

  function ensureBridge(): Promise<void> {
    if (bridgeReady === null) {
      bridgeReady = (async () => {
        const [{ invoke }, { listen }] = await Promise.all([
          import('@tauri-apps/api/core'),
          import('@tauri-apps/api/event'),
        ]);
        unlisteners.push(
          await listen<{ id: number; data: string }>('pty-output', (event) => {
            if (event.payload.id !== currentId) return;
            for (const handler of outputHandlers) handler(event.payload.data);
          }),
        );
        unlisteners.push(
          await listen<{ id: number; code: number | null }>('pty-exit', (event) => {
            if (event.payload.id !== currentId) return;
            currentId = null;
            for (const handler of exitHandlers) handler(event.payload.code);
          }),
        );
        bridgeInvoke = invoke;
      })();
    }
    return bridgeReady;
  }
  let bridgeInvoke: typeof import('@tauri-apps/api/core').invoke | null = null;

  async function killCurrent(): Promise<void> {
    const id = currentId;
    currentId = null;
    if (id !== null && bridgeInvoke !== null) {
      try {
        await bridgeInvoke('pty_kill', { id });
      } catch {
        // 进程可能已退出;壳侧按 id 查不到即无操作。
      }
    }
  }

  return {
    async start(cwd: string, cols: number, rows: number): Promise<LocalPtySession> {
      if (starting) throw new Error('terminal starting');
      starting = true;
      try {
        await ensureBridge();
        await killCurrent();
        const info = await bridgeInvoke!<LocalPtySession>('pty_create', {
          cwd,
          cols: Math.max(1, cols),
          rows: Math.max(1, rows),
        });
        currentId = info.id;
        return info;
      } finally {
        starting = false;
      }
    },
    write(data: string): void {
      const id = currentId;
      if (id === null || bridgeInvoke === null) return;
      void bridgeInvoke('pty_write', { id, data }).catch(() => {
        // 写失败多为进程已退出,exit 事件会接管 UI 状态。
      });
    },
    resize(cols: number, rows: number): void {
      const id = currentId;
      if (id === null || bridgeInvoke === null) return;
      void bridgeInvoke('pty_resize', { id, cols: Math.max(1, cols), rows: Math.max(1, rows) }).catch(() => {});
    },
    kill(): void {
      void killCurrent();
    },
    onOutput(handler: (data: string) => void): () => void {
      outputHandlers.add(handler);
      return () => outputHandlers.delete(handler);
    },
    onExit(handler: (code: number | null) => void): () => void {
      exitHandlers.add(handler);
      return () => exitHandlers.delete(handler);
    },
    dispose(): void {
      void killCurrent();
      for (const unlisten of unlisteners.splice(0)) unlisten();
      outputHandlers.clear();
      exitHandlers.clear();
    },
  };
}
