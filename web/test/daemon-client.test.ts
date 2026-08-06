// apps/kimi-web/test/daemon-client.test.ts
// DaemonKimiWebApi public REST adapter: session export binary/error contracts,
// getSessionGoal wire → app mapping, and raw stream-coordinate delivery.
// Wiring: real client/projector; fetch or WebSocket is stubbed at the network boundary.
// Run: pnpm --filter @moonshot-ai/kimi-web exec vitest run test/daemon-client.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DaemonKimiWebApi } from '../src/api/daemon/client';
import { DaemonApiError, DaemonNetworkError } from '../src/api/errors';
import { clearTrace, traceToJsonl } from '../src/debug/trace';
import type { AppEvent, KimiEventConnection, KimiEventMeta } from '../src/api/types';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly OPEN = FakeWebSocket.OPEN;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: CloseEvent) => void) | null = null;

  constructor(_url: string, _protocols?: string | string[]) {
    FakeWebSocket.instances.push(this);
  }

  send(_data: string): void {}

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: '', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const WIRE_GOAL = {
  goalId: 'goal_1',
  objective: 'fix all lint warnings',
  status: 'active',
  turnsUsed: 1,
  tokensUsed: 0,
  wallClockMs: 0,
  budget: {
    tokenBudget: null,
    turnBudget: null,
    wallClockBudgetMs: null,
    remainingTokens: null,
    remainingTurns: null,
    remainingWallClockMs: null,
    tokenBudgetReached: false,
    turnBudgetReached: false,
    wallClockBudgetReached: false,
    overBudget: false,
  },
};

function createApi(): DaemonKimiWebApi {
  return new DaemonKimiWebApi({
    serverHttpUrl: 'http://daemon.test',
    clientId: 'web_test',
    clientName: 'test',
    clientVersion: '0.0.0',
    clientUiMode: 'test',
  });
}

describe('DaemonKimiWebApi.getMeta', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('maps 0.33 effective experimental flags', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({
      server_version: '0.33.0',
      server_id: 'server-1',
      started_at: '2026-08-05T00:00:00.000Z',
      capabilities: { websocket: true },
      experimental_flags: { 'secondary-model': true },
      open_in_apps: [],
      dangerous_bypass_auth: false,
      backend: 'v2',
    }));

    await expect(createApi().getMeta()).resolves.toMatchObject({
      experimentalFlags: { 'secondary-model': true },
      backend: 'v2',
    });
  });

  it('treats an omitted flag map as no enabled flags', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({
      server_version: '0.33.0',
      server_id: 'server-1',
      started_at: '2026-08-05T00:00:00.000Z',
      capabilities: {},
      backend: 'v2',
    }));

    await expect(createApi().getMeta()).resolves.toMatchObject({ experimentalFlags: {} });
  });
});

describe('DaemonKimiWebApi.exportSession', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { search: '?debug=1' });
    vi.stubGlobal('fetch', vi.fn());
    clearTrace();
  });

  afterEach(() => {
    clearTrace();
    vi.unstubAllGlobals();
  });

  it('posts the Web log to the encoded session export endpoint and returns the ZIP', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75, 3, 4]), {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="session-export.zip"',
        },
      }),
    );

    const result = await createApi().exportSession('sess/1', '{"event":"safe"}');

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess%2F1/export',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ web_log: '{"event":"safe"}' }),
    });
    expect(result.fileName).toBe('session-export.zip');
    expect(result.blob.size).toBe(4);
  });

  it('falls back to a session-id ZIP name for an unsafe response filename', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75]), {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="../credentials.zip"',
        },
      }),
    );

    const result = await createApi().exportSession('sess_1');

    expect(result.fileName).toBe('sess_1.zip');
  });

  it('parses a JSON error envelope returned by the export endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 41301, msg: 'export too large', request_id: 'req_server' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const caught = await createApi()
      .exportSession('sess_1', 'log')
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonApiError);
    expect(caught).toMatchObject({ code: 41301, requestId: 'req_server' });
  });

  it('rejects a successful response whose media type is not a ZIP', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('not a zip', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const caught = await createApi().exportSession('sess_1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
    expect(caught).toMatchObject({ phase: 'parse', contentType: 'text/plain' });
  });

  it('records only Web-log counts in the request trace', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75]), {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    );
    const secret = 'PROMPT_CONTENT_MUST_NOT_ENTER_TRACE';

    await createApi().exportSession('sess_1', `${secret}\nsecond line`);

    const trace = traceToJsonl();
    expect(trace).not.toContain(secret);
    expect(trace).toContain('web_log_bytes');
    expect(trace).toContain('web_log_entries');
  });
});

describe('DaemonKimiWebApi.getSessionGoal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a present goal snapshot', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_GOAL));
    const goal = await createApi().getSessionGoal('sess_1');
    expect(goal?.objective).toBe('fix all lint warnings');
    expect(goal?.status).toBe('active');
    expect(goal?.turnsUsed).toBe(1);
  });

  it('maps null to null (no active goal)', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(null));
    const goal = await createApi().getSessionGoal('sess_1');
    expect(goal).toBeNull();
  });

  it('requests the session goal endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(null));
    await createApi().getSessionGoal('sess_42');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess_42/goal',
    );
  });
});

describe('DaemonKimiWebApi provider writes', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { search: '?debug=1' });
    vi.stubGlobal('fetch', vi.fn());
    clearTrace();
  });

  afterEach(() => {
    clearTrace();
    vi.unstubAllGlobals();
  });

  it('uses the daemon replace endpoint and omits a saved key when the edit leaves it blank', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({
      provider: {
        id: 'openai-renamed',
        type: 'openai_responses',
        base_url: 'https://example.test/v1',
        default_model: 'openai-renamed/model-a',
        has_api_key: true,
        status: 'connected',
        models: ['openai-renamed/model-a'],
      },
    }));

    await createApi().updateProvider('openai/main', {
      id: 'openai-renamed',
      type: 'openai_responses',
      baseUrl: 'https://example.test/v1',
      defaultModel: 'model-a',
      models: [{ model: 'model-a', maxContextSize: 128_000 }],
    });

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/providers/openai%2Fmain',
    );
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      new_id: 'openai-renamed',
      type: 'openai_responses',
      base_url: 'https://example.test/v1',
      default_model: 'model-a',
      models: [{ model: 'model-a', max_context_size: 128_000 }],
    });
    expect(body).not.toHaveProperty('api_key');
  });

  it('sends a replacement key but redacts it from debug traces', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({
      provider: {
        id: 'local', type: 'openai', has_api_key: true, status: 'connected', models: ['local/model-a'],
      },
    }));
    const replacement = 'KEY_MUST_NOT_ENTER_TRACE';

    await createApi().updateProvider('local', {
      id: 'local',
      type: 'openai',
      apiKey: replacement,
      models: [{ model: 'model-a', maxContextSize: 64_000 }],
    });

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toHaveProperty('api_key', replacement);
    expect(traceToJsonl()).not.toContain(replacement);
    expect(traceToJsonl()).toContain('[redacted]');
  });

  it('accepts the daemon 204 response when deleting a manual provider', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(createApi().deleteProvider('local/provider')).resolves.toBeUndefined();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/providers/local%2Fprovider',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('maps the daemon-proxied models.dev directory without shelling out to the CLI', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({
      items: [{
        id: 'anthropic',
        name: 'Anthropic',
        wire_type: 'anthropic',
        guessed: false,
        needs_base_url: false,
        rejected: false,
        reject_reason: null,
        env_key: 'ANTHROPIC_API_KEY',
        models: [{
          id: 'claude-test',
          name: 'Claude Test',
          max_context_size: 200_000,
          capabilities: ['thinking'],
          reasoning: true,
        }],
      }],
    }));

    await expect(createApi().listCatalogProviders()).resolves.toEqual([expect.objectContaining({
      id: 'anthropic',
      wireType: 'anthropic',
      envKey: 'ANTHROPIC_API_KEY',
      models: [expect.objectContaining({ id: 'claude-test', maxContextSize: 200_000 })],
    })]);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/catalog/providers',
    );
  });

  it('imports a catalog provider directly and keeps an omitted API key omitted', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({
      provider: {
        id: 'anthropic', type: 'anthropic', has_api_key: false, status: 'unconfigured', models: ['anthropic/claude-test'],
      },
      models_imported: 1,
    }));

    await expect(createApi().importCatalogProvider({ catalogId: 'anthropic' })).resolves.toMatchObject({
      modelsImported: 1,
      provider: { id: 'anthropic' },
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/providers:import_catalog');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ catalog_id: 'anthropic' });
  });

  it('imports a private registry with an optional Bearer key and redacts it from traces', async () => {
    const secret = 'REGISTRY_KEY_MUST_NOT_ENTER_TRACE';
    vi.mocked(fetch).mockResolvedValue(envelope({
      providers: [{
        id: 'private', type: 'openai', has_api_key: true, status: 'connected', models: ['private/model-a'],
      }],
      models_imported: 1,
    }));

    await createApi().importProviderRegistry({
      url: 'https://registry.example.test/api.json',
      apiKey: secret,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/providers:import_registry');
    expect(JSON.parse(String(init?.body))).toMatchObject({ api_key: secret });
    expect(traceToJsonl()).not.toContain(secret);
    expect(traceToJsonl()).toContain('[redacted]');
  });
});

describe('DaemonKimiWebApi workspace trust', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('reads and updates trust through the public 0.33 workspace routes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(envelope({ trusted: false }))
      .mockResolvedValueOnce(envelope({ trusted: true }))
      .mockResolvedValueOnce(envelope({ trusted: false }));
    const api = createApi();

    await expect(api.getWorkspaceTrust('workspace/1')).resolves.toEqual({ trusted: false });
    await expect(api.trustWorkspace('workspace/1')).resolves.toEqual({ trusted: true });
    await expect(api.untrustWorkspace('workspace/1')).resolves.toEqual({ trusted: false });

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([url]) => url)).toEqual([
      'http://daemon.test/api/v1/workspaces/workspace%2F1/trust',
      'http://daemon.test/api/v1/workspaces/workspace%2F1/trust',
      'http://daemon.test/api/v1/workspaces/workspace%2F1/untrust',
    ]);
    expect(calls.map(([, init]) => init?.method)).toEqual(['GET', 'POST', 'POST']);
  });
});

describe('DaemonKimiWebApi.connectEvents', () => {
  let connection: KimiEventConnection | undefined;

  afterEach(() => {
    connection?.close();
    connection = undefined;
    vi.unstubAllGlobals();
  });

  it('delivers raw assistant stream coordinates with the projected delta', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: Array<{ event: AppEvent; meta: KimiEventMeta }> = [];
    connection = createApi().connectEvents({
      onEvent(event, meta) {
        received.push({ event, meta });
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const socket = FakeWebSocket.instances[0]!;

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'turn.started',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { agentId: 'main', turnId: 7 },
    });
    socket.emit({
      type: 'turn.step.started',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { agentId: 'main', turnId: 7, step: 1 },
    });
    socket.emit({
      type: 'assistant.delta',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      volatile: true,
      offset: 0,
      payload: { agentId: 'main', turnId: 7, delta: 'hello' },
    });
    socket.emit({
      type: 'thinking.delta',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      volatile: true,
      offset: 0,
      payload: { agentId: 'main', turnId: 7, delta: 'thought' },
    });

    const delta = received.find(({ event }) => event.type === 'assistantDelta');
    expect(delta).toMatchObject({
      event: {
        type: 'assistantDelta',
        sessionId: 'session-1',
        delta: { text: 'hello' },
      },
      meta: {
        sessionId: 'session-1',
        seq: 2,
        stream: { turnId: 7, offset: 0, kind: 'text' },
      },
    });

    const thinking = received.find(
      ({ event }) => event.type === 'assistantDelta' && event.delta.thinking !== undefined,
    );
    expect(thinking).toMatchObject({
      event: {
        type: 'assistantDelta',
        sessionId: 'session-1',
        delta: { thinking: 'thought' },
      },
      meta: {
        sessionId: 'session-1',
        seq: 2,
        stream: { turnId: 7, offset: 0, kind: 'thinking' },
      },
    });
  });

  it('projects list-level work facts from the global session event', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.session.work_changed',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {
        busy: true,
        main_turn_active: false,
        pending_interaction: 'question',
      },
    });

    expect(received).toContainEqual({
      type: 'sessionWorkChanged',
      sessionId: 'session-1',
      busy: true,
      mainTurnActive: false,
      pendingInteraction: 'question',
      lastTurnReason: undefined,
    });
  });

  it('projects global config warnings from the 0.33 event contract', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: Array<{ event: AppEvent; meta: KimiEventMeta }> = [];
    connection = createApi().connectEvents({
      onEvent(event, meta) {
        received.push({ event, meta });
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.config.warning',
      seq: 1,
      session_id: '__global__',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {
        warnings: [
          {
            domain: 'loop_control',
            message: 'max_retries_per_step was renamed to max_attempts_per_step',
          },
        ],
      },
    });

    expect(received).toContainEqual({
      event: {
        type: 'configWarningsChanged',
        warnings: [
          {
            domain: 'loop_control',
            message: 'max_retries_per_step was renamed to max_attempts_per_step',
          },
        ],
      },
      meta: {
        sessionId: '__global__',
        seq: 1,
      },
    });
  });
});
