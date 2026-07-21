import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const webPort = Number(process.env.WEB_PORT) || 5175;
// Dev-proxy backend presets: `default` is the kap-server started by the root
// `pnpm dev:server` (port 58627); `multi` is a second kap-server instance
// started with `pnpm dev:v2` (port 58628 — instances share the home dir, so
// both can run at once) for multi-instance debugging. Override with
// KIMI_BACKEND_DEFAULT_URL / KIMI_BACKEND_MULTI_URL.
const backendPresets = {
  default: process.env.KIMI_BACKEND_DEFAULT_URL || 'http://127.0.0.1:58627',
  multi: process.env.KIMI_BACKEND_MULTI_URL || 'http://127.0.0.1:58628',
} as const;
type BackendName = keyof typeof backendPresets;
// Where the dev proxy forwards server traffic. Defaults to the `default`
// preset; KIMI_SERVER_URL pins the initial target (and disables nothing — the
// dev switcher can still move it at runtime).
const serverTarget = process.env.KIMI_SERVER_URL || backendPresets.default;
// Mutable proxy target. Vite copies its proxy-options object per HTTP request
// and reads it directly per WS upgrade, so assigning `target` on the captured
// options repoints the proxy without a dev-server restart (see the plugin).
let currentBackendTarget = serverTarget;
let backendProxyOpts: { target?: unknown } | null = null;
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};
/** 应用版本号:单一事实来源是 src-tauri/tauri.conf.json 的 version(打包同名)。 */
const appVersion = (
  JSON.parse(
    readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf-8'),
  ) as { version: string }
).version;

/**
 * kimi-gui 改:MPA 下会话深链的 fallback 目标修正(修"reload 回到 kimi web")。
 *
 * 背景:vite 默认 appType 'spa',history fallback 会把 `/sessions/<id>` 这类
 * 无扩展名路径 rewrite 到 /index.html(**官方 UI**)。Tauri dev 里点进会话后
 * URL 变成 /sessions/<id>,右键 Reload 就加载了官方页,看起来"我们的页面没了"。
 * kimi-gui 的产品页是 /app.html,所以在 vite 内部 fallback 之前,把无扩展名的
 * 导航路径统一 rewrite 到 /app.html。
 * 取舍:官方 index.html 的深链在 dev 下也会回到 app.html(官方页仅作 fork 参考)。
 */
function appHtmlFallbackPlugin(): Plugin {
  const PASSTHROUGH = ['/api/', '/v1', '/@', '/node_modules/', '/src/', '/__kimi-dev/', '/assets/'];
  const PAGES = ['/app.html', '/index.html', '/codex.html'];
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: () => void): void => {
    if (req.method !== 'GET') return next();
    const url = (req.url || '').split('?')[0];
    if (PAGES.includes(url)) return next();
    if (PASSTHROUGH.some((p) => url.startsWith(p))) return next();
    const last = url.split('/').pop() || '';
    if (last.includes('.')) return next(); // 静态资源(有扩展名)不动
    req.url = '/app.html'; // 无扩展名的导航路径(含 /sessions/<id> 和 /)→ 产品页
    return next();
  };
  return {
    name: 'kimi-app-html-fallback',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

/**
 * Dev-only backend switcher. Two endpoints let the web UI read and move the
 * proxy target at runtime (the Sidebar badge menu POSTs here, then reloads):
 *   GET  /__kimi-dev/backend           → { current, presets }
 *   POST /__kimi-dev/backend { name }  → switch to presets[name]
 * Preview keeps the static proxy below — this only hooks the dev server.
 */
function backendSwitcherPlugin(): Plugin {
  const sendJson = (res: ServerResponse, body: unknown): void => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const state = (): { current: string; presets: typeof backendPresets } => ({
    current: currentBackendTarget,
    presets: backendPresets,
  });
  const switchTo = (name: BackendName): void => {
    currentBackendTarget = backendPresets[name];
    // Repoint the live proxy. NOTE: vite's vendored http-proxy has no
    // `router` support — mutating the captured options object is the switch.
    if (backendProxyOpts) backendProxyOpts.target = currentBackendTarget;
  };
  return {
    name: 'kimi-backend-switcher',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url !== '/__kimi-dev/backend') return next();
        if (req.method === 'GET') {
          sendJson(res, state());
          return;
        }
        if (req.method === 'POST') {
          let raw = '';
          req.on('data', (chunk: Buffer) => (raw += chunk));
          req.on('end', () => {
            let name: unknown;
            try {
              name = (JSON.parse(raw) as { name?: unknown }).name;
            } catch {
              name = undefined;
            }
            if (name !== 'default' && name !== 'multi') {
              res.statusCode = 400;
              sendJson(res, { error: 'expected { "name": "default" | "multi" }' });
              return;
            }
            switchTo(name as BackendName);
            sendJson(res, state());
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

// Shared proxy behavior for dev AND preview. `configure` does two things:
//   1. captures vite's live proxy-options object so the dev backend switcher
//      can repoint `target` at runtime (vite's vendored http-proxy ignores
//      `router`; a fresh copy of this object is consulted per HTTP request,
//      and the object itself per WS upgrade);
//   2. strips the browser `Origin` header on the forwarded request. The proxy
//      rewrites `Host` to the server (changeOrigin) but leaves `Origin`
//      pointing at the Vite origin — and kap-server's WS upgrade path
//      rejects any present Origin whose host ≠ Host with 403. An Origin-less
//      request is treated as a non-browser client (and the browser never
//      needs CORS here: it talks to its own origin).
const apiProxyOptions = {
  target: serverTarget,
  changeOrigin: true,
  ws: true,
  configure: (
    proxy: {
      on(
        event: string,
        listener: (proxyReq: { removeHeader(name: string): void }) => void,
      ): unknown;
    },
    options: { target?: unknown },
  ) => {
    backendProxyOpts = options;
    proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
    proxy.on('proxyReqWs', (proxyReq) => proxyReq.removeHeader('origin'));
  },
};

export default defineConfig({
  plugins: [
    vue(),
    backendSwitcherPlugin(),
    appHtmlFallbackPlugin(),
    Icons({
      compiler: 'vue3',
      // Local Kimi Design System icons (24×24 outlined, fill="currentColor"),
      // copied from the design-system icon pack into src/icons/kimi/ and
      // imported as `~icons/kimi/<file-name>` (plus `?raw`), same as the ri
      // collection. Registered in src/lib/icons.ts only.
      customCollections: {
        kimi: FileSystemIconLoader(fileURLToPath(new URL('./src/icons/kimi', import.meta.url))),
      },
    }),
  ],
  // Expose the dev proxy's upstream server target to the client so the UI can
  // show which server it is connected to (the browser otherwise only sees its
  // own same-origin URL). Unused by the same-origin production build.
  define: {
    __KIMI_DEV_PROXY_TARGET__: JSON.stringify(serverTarget),
    // Named backend presets for the Sidebar switcher menu (dev only).
    __KIMI_DEV_BACKENDS__: JSON.stringify(backendPresets),
    __KIMI_WEB_VERSION__: JSON.stringify(pkg.version),
    /** 应用版本(= tauri.conf.json version),关于页/状态栏展示用 */
    __APP_VERSION__: JSON.stringify(appVersion),
    // True only for the web bundle embedded in the Kimi Desktop app (set by the
    // desktop-build workflow). Gates an "internal testing build" banner. When
    // false (default) the banner is tree-shaken out of the production bundle.
    __KIMI_WEB_DESKTOP__: JSON.stringify(process.env.KIMI_WEB_DESKTOP === '1'),
  },
  server: {
    port: webPort,
    // kimi-gui 改:strictPort=true。Tauri 的 devUrl 锁 5175,端口被占时
    // 直接失败暴露问题,而不是静默换端口导致 Tauri 窗口加载空白。
    strictPort: true,
    // Same-origin dev: the browser calls Vite, Vite forwards to the server.
    // No CORS anywhere. The real server serves REST + WS all under /api/v1.
    proxy: {
      '/api/v1': apiProxyOptions,
    },
  },
  // `vite preview` (the production build served locally) needs the same proxy —
  // bugs that only exist in production chunking (e.g. optional-peer-dep stubs)
  // can't be reproduced without running the built app against a server.
  // Preview intentionally stays on the static target: no runtime switcher.
  preview: {
    port: Number(process.env.WEB_PREVIEW_PORT) || 4175,
    proxy: {
      '/api/v1': apiProxyOptions,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // kimi-gui 改:多页面 build(app.html 是 codex UI 入口,codex.html 是沙箱)
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        codex: resolve(__dirname, 'codex.html'),
      },
    },
  },
  // Workers that import modules with code-splitting (e.g. mermaid's dynamic
  // diagram imports) need ES format — IIFE cannot split chunks. The app
  // already targets ES2022 so all supported browsers handle module workers.
  worker: {
    format: 'es',
  },
});
