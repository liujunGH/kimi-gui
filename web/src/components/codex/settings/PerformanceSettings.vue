<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useKimiClient } from '../../../composables/codex/useKimiClient';
import { kimiNativeAvailable, kimiRuntime, type KimiPerformanceConfig } from '../../../composables/useKimiRuntime';
import { useToast } from '../layout/Toast.vue';
import { writeCacheExpiryHintEnabled } from '../../../lib/cacheHint';

const client = useKimiClient();
const { toast } = useToast();
const nativeAvailable = kimiNativeAvailable();
const loading = ref(false);
const saving = ref(false);
const advanced = ref(false);
const draft = ref<KimiPerformanceConfig | null>(null);

const presets: Record<'balanced' | 'fast' | 'controlled', KimiPerformanceConfig> = {
  balanced: { maxStepsPerTurn: undefined, maxAttemptsPerStep: 10, reservedContextSize: undefined, maxRunningTasks: 4, bashAutoBackgroundOnTimeout: true, bashTaskTimeoutS: 600, subagentTimeoutMs: 7_200_000, mcpStartupTimeoutMs: 30_000, mcpToolTimeoutMs: 60_000, tokenCountingStrategy: 'measured+estimated', imageMaxEdgePx: 2_000, imageReadByteBudget: 262_144, cacheExpiryHint: true },
  fast: { maxStepsPerTurn: 100, maxAttemptsPerStep: 6, reservedContextSize: 32_000, maxRunningTasks: 8, bashAutoBackgroundOnTimeout: true, bashTaskTimeoutS: 300, subagentTimeoutMs: 3_600_000, mcpStartupTimeoutMs: 15_000, mcpToolTimeoutMs: 45_000, tokenCountingStrategy: 'estimated', imageMaxEdgePx: 1_600, imageReadByteBudget: 196_608, cacheExpiryHint: true },
  controlled: { maxStepsPerTurn: 40, maxAttemptsPerStep: 4, reservedContextSize: 64_000, maxRunningTasks: 2, bashAutoBackgroundOnTimeout: false, bashTaskTimeoutS: 300, subagentTimeoutMs: 1_800_000, mcpStartupTimeoutMs: 30_000, mcpToolTimeoutMs: 60_000, tokenCountingStrategy: 'measured+estimated', imageMaxEdgePx: 1_600, imageReadByteBudget: 196_608, cacheExpiryHint: true },
};

const selectedPreset = computed(() => {
  if (!draft.value) return '';
  return (Object.entries(presets).find(([, value]) => JSON.stringify(value) === JSON.stringify(draft.value))?.[0] ?? 'custom');
});

async function load(): Promise<void> {
  if (!nativeAvailable) return;
  loading.value = true;
  try { draft.value = await kimiRuntime.readPerformanceConfig(); }
  catch (error) { toast(error instanceof Error ? error.message : '性能配置加载失败'); }
  finally { loading.value = false; }
}

function applyPreset(name: keyof typeof presets): void {
  draft.value = structuredClone(presets[name]);
}

function optionalNumber(event: Event, field: 'maxStepsPerTurn' | 'reservedContextSize' | 'maxRunningTasks'): void {
  if (!draft.value) return;
  const raw = (event.target as HTMLInputElement).value;
  draft.value[field] = raw === '' ? undefined : Number(raw);
}

async function save(): Promise<void> {
  if (!draft.value) return;
  saving.value = true;
  try {
    draft.value = await kimiRuntime.savePerformanceConfig(draft.value);
    writeCacheExpiryHintEnabled(draft.value.cacheExpiryHint);
    // 0.33 exposes loop_control/background through REST, so current daemon can
    // adopt these two groups without a restart. File-only groups are read by
    // new sessions or the next daemon start.
    await client.updateConfig({
      loopControl: {
        max_steps_per_turn: draft.value.maxStepsPerTurn,
        max_attempts_per_step: draft.value.maxAttemptsPerStep,
        reserved_context_size: draft.value.reservedContextSize,
      },
      background: {
        max_running_tasks: draft.value.maxRunningTasks,
        bash_auto_background_on_timeout: draft.value.bashAutoBackgroundOnTimeout,
        bash_task_timeout_s: draft.value.bashTaskTimeoutS,
      },
    });
    toast('运行与性能配置已保存；文件级配置从新任务或下次 daemon 启动起完整生效');
  } catch (error) {
    toast(error instanceof Error ? error.message : '性能配置保存失败');
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <div class="performance-settings">
    <div v-if="!nativeAvailable" class="settings-callout">运行与性能配置写入本机 ~/.kimi-code/config.toml，仅桌面应用可编辑。</div>
    <div v-else-if="loading" class="settings-callout subtle">正在读取 Kimi Code 配置…</div>
    <template v-else-if="draft">
      <div class="preset-grid">
        <button v-for="(_, key) in presets" :key="key" class="preset-card" :class="{ active: selectedPreset === key }" @click="applyPreset(key)">
          <strong>{{ key === 'balanced' ? '均衡' : key === 'fast' ? '快速' : '受控' }}</strong>
          <span>{{ key === 'balanced' ? '官方默认附近，适合日常任务' : key === 'fast' ? '提高并行度、缩短等待上限' : '限制步数与并行，强调可控成本' }}</span>
        </button>
      </div>
      <h3 class="settings-group-title">Agent 与后台任务</h3>
      <div class="perf-grid">
        <label><span>单轮最大步数 <small>留空为官方默认</small></span><input class="control" type="number" min="1" max="10000" :value="draft.maxStepsPerTurn ?? ''" @input="optionalNumber($event, 'maxStepsPerTurn')" /></label>
        <label><span>每步最大尝试</span><input v-model.number="draft.maxAttemptsPerStep" class="control" type="number" min="1" max="100" /></label>
        <label><span>后台并发上限 <small>1–64</small></span><input class="control" type="number" min="1" max="64" :value="draft.maxRunningTasks ?? ''" @input="optionalNumber($event, 'maxRunningTasks')" /></label>
        <label><span>Bash 转后台阈值 <small>秒</small></span><input v-model.number="draft.bashTaskTimeoutS" class="control" type="number" min="10" max="86400" /></label>
        <label><span>子智能体超时 <small>分钟</small></span><input class="control" type="number" min="1" max="1440" :value="Math.round(draft.subagentTimeoutMs / 60000)" @input="draft.subagentTimeoutMs = Number(($event.target as HTMLInputElement).value) * 60000" /></label>
        <label class="toggle-field"><span>长 Bash 自动转后台</span><input v-model="draft.bashAutoBackgroundOnTimeout" type="checkbox" /></label>
      </div>
      <button class="advanced-toggle" @click="advanced = !advanced">{{ advanced ? '收起高级配置' : '展开上下文、MCP 与图像高级配置' }}</button>
      <div v-if="advanced" class="perf-grid advanced-grid">
        <label><span>预留上下文 <small>tokens，留空为默认</small></span><input class="control" type="number" min="1" max="2000000" :value="draft.reservedContextSize ?? ''" @input="optionalNumber($event, 'reservedContextSize')" /></label>
        <label><span>Token 计数策略</span><select v-model="draft.tokenCountingStrategy" class="control"><option value="measured+estimated">实测 + 估算</option><option value="measured">仅实测</option><option value="estimated">仅估算</option></select></label>
        <label><span>MCP 启动超时 <small>毫秒</small></span><input v-model.number="draft.mcpStartupTimeoutMs" class="control" type="number" min="1000" max="600000" /></label>
        <label><span>MCP 工具超时 <small>毫秒</small></span><input v-model.number="draft.mcpToolTimeoutMs" class="control" type="number" min="1000" max="3600000" /></label>
        <label><span>图像最长边 <small>像素</small></span><input v-model.number="draft.imageMaxEdgePx" class="control" type="number" min="256" max="8192" /></label>
        <label><span>图像读取预算 <small>字节</small></span><input v-model.number="draft.imageReadByteBudget" class="control" type="number" min="65536" max="16777216" /></label>
      </div>
      <div class="setting-row">
        <div class="setting-info"><div class="setting-label">缓存过期提醒</div><div class="setting-desc">长时间闲置且上下文较大时，在发送前提示压缩或新建任务。未知模型不会误报。</div></div>
        <div class="setting-control"><label class="switch"><input v-model="draft.cacheExpiryHint" type="checkbox" /><span class="switch-slider" /></label></div>
      </div>
      <div class="settings-button-row save-row"><span class="setting-desc">当前预设：{{ selectedPreset === 'custom' ? '自定义' : selectedPreset === 'balanced' ? '均衡' : selectedPreset === 'fast' ? '快速' : '受控' }}</span><button class="btn" :disabled="saving" @click="load">恢复磁盘值</button><button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存并应用' }}</button></div>
    </template>
  </div>
</template>

<style scoped>
.performance-settings{display:grid;gap:16px}.preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.preset-card{display:flex;flex-direction:column;gap:5px;text-align:left;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:inherit;cursor:pointer}.preset-card:hover,.preset-card.active{border-color:var(--accent,#1677ff)}.preset-card.active{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent,#1677ff) 12%,transparent)}.preset-card span{font-size:12px;color:var(--text-3);line-height:1.5}.perf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.perf-grid label{display:grid;gap:6px;padding:11px;border:1px solid var(--border);border-radius:10px}.perf-grid label>span{font-size:13px;font-weight:600}.perf-grid small{font-weight:400;color:var(--text-3)}.perf-grid .toggle-field{grid-template-columns:1fr auto;align-items:center}.advanced-toggle{justify-self:start;border:0;background:none;color:var(--accent,#1677ff);cursor:pointer;padding:2px}.advanced-grid{padding:12px;border:1px dashed var(--border);border-radius:12px}.save-row{justify-content:flex-end}.save-row .setting-desc{margin-right:auto}@media(max-width:800px){.preset-grid,.perf-grid{grid-template-columns:1fr}}
</style>
