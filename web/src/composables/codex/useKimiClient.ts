/**
 * useKimiClient —— codex 组件层访问 daemon client 的桥
 *
 * 架构(ARCHITECTURE 第 2、3 节):
 * - App.vue 顶层调官方 useKimiWebClient() 拿 client 实例
 * - 通过 provide(KIMI_CLIENT_KEY, client) 注入
 * - codex 组件用 useKimiClient() inject 拿到同一实例
 *
 * 职责边界(HANDOFF 轮次 0.1):
 * - 这里只暴露**读取数据 ref + 意图方法**(send/steer/approve/queue 等)
 * - **不在 composable 里写组件行为**(对话框、菜单、动画)—— 那归 kimi3
 * - 数据联动状态(modelsLoading / skillsLoading 等)由本桥暴露,kimi3 只读
 *
 * ⚠️ 轮次 1 阶段:签名占位 + client inject 桥,实际意图方法对接 client 的
 * 动作在轮次 3 由 ZCode 完成。
 */
import { inject, type InjectionKey } from 'vue';
import { useKimiWebClient } from '../useKimiWebClient';

/**
 * 官方 useKimiWebClient 返回值的类型(从官方函数签名推导,不展开 3000+ 行 API)。
 * 组件按需通过 `client.xxx` 访问,typescript 自动推导。
 */
export type KimiClient = ReturnType<typeof useKimiWebClient>;

export const KIMI_CLIENT_KEY: InjectionKey<KimiClient> = Symbol('kimi-client');

/**
 * codex 组件用这个拿 client 实例。
 * 必须在 App.vue provide(KIMI_CLIENT_KEY, client) 之后使用,否则抛错(早暴露问题)。
 */
export function useKimiClient(): KimiClient {
  const client = inject(KIMI_CLIENT_KEY);
  if (!client) {
    throw new Error(
      'useKimiClient() 必须在 App.vue 顶层 provide(KIMI_CLIENT_KEY, client) 之后使用',
    );
  }
  return client;
}
