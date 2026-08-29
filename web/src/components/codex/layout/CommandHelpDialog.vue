<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import i18n from '../../../i18n';
import {
  GUI_COMMAND_MAPPINGS,
  UPSTREAM_COMMANDS,
  UPSTREAM_COMMAND_SOURCE,
  resolveBuiltinCommand,
  type CommandMapping,
} from '../../../lib/commandRegistry';
import CodexIcon from './CodexIcon.vue';

const emit = defineEmits<{
  (e: 'run', command: string): void;
  (e: 'close'): void;
}>();

/** 上游契约快照版本(ref 形如 `@moonshot-ai/kimi-code@0.39.1`,取末段)。
 *  与 commandRegistry 同源,上游升级后此处不再需要手工同步。 */
const sourceVersion = (() => {
  const ref = UPSTREAM_COMMAND_SOURCE.ref;
  const at = ref.lastIndexOf('@');
  return at >= 0 ? ref.slice(at + 1) : ref;
})();

const query = ref('');
const input = ref<HTMLInputElement | null>(null);

function mappingLabel(mapping: CommandMapping): string {
  if (mapping.kind === 'command') return '可直接执行';
  if (mapping.kind === 'native-ui') return `GUI · ${i18n.global.t(mapping.locationKey)}`;
  if (mapping.kind === 'tui-only') return '仅 TUI';
  return mapping.reason === 'daemon-api' ? '等待 daemon 接口' : '尚未实现';
}

const rows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return UPSTREAM_COMMANDS.map((item) => {
    const mapping = GUI_COMMAND_MAPPINGS[item.name]!;
    const aliases = item.aliases
      .filter((alias) => resolveBuiltinCommand(alias)?.canonicalName === item.name)
      .map((alias) => `/${alias}`)
      .join(' ');
    return {
      name: item.name,
      aliases,
      mapping,
      status: mappingLabel(mapping),
      executable: mapping.kind === 'command' || mapping.kind === 'native-ui',
    };
  }).filter((item) => !needle || [item.name, item.aliases, item.status].some((value) => value.toLowerCase().includes(needle)));
});

const grouped = computed(() => [
  { id: 'ready', title: 'GUI 可用', rows: rows.value.filter((item) => item.mapping.surface !== 'tui' && item.mapping.kind !== 'unavailable') },
  { id: 'tui', title: '终端专属', rows: rows.value.filter((item) => item.mapping.surface === 'tui') },
  { id: 'pending', title: '契约缺口', rows: rows.value.filter((item) => item.mapping.kind === 'unavailable') },
].filter((group) => group.rows.length));

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  void nextTick(() => input.value?.focus());
});
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="command-help-overlay" @click.self="emit('close')">
    <section class="command-help" role="dialog" aria-modal="true" aria-labelledby="command-help-title">
      <header class="command-help-head">
        <div>
          <h2 id="command-help-title">命令与能力</h2>
          <p>命令按 Kimi Code {{ sourceVersion }} 契约分类；GUI 能力会显示实际入口。</p>
        </div>
        <button class="icon-btn" aria-label="关闭" @click="emit('close')"><CodexIcon name="x" /></button>
      </header>
      <label class="command-help-search">
        <CodexIcon name="search" />
        <input ref="input" v-model="query" placeholder="搜索命令、别名或状态…" />
      </label>
      <div class="command-help-body">
        <section v-for="group in grouped" :key="group.id" class="command-help-group">
          <h3>{{ group.title }} <span>{{ group.rows.length }}</span></h3>
          <button
            v-for="row in group.rows"
            :key="row.name"
            type="button"
            class="command-help-row"
            :class="{ executable: row.executable }"
            :disabled="!row.executable"
            @click="emit('run', `/${row.name}`)"
          >
            <span class="command-help-name"><code>/{{ row.name }}</code><small v-if="row.aliases">{{ row.aliases }}</small></span>
            <span class="command-help-status">{{ row.status }}</span>
          </button>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.command-help-overlay { position: fixed; inset: 0; z-index: 96; display: grid; place-items: center; padding: 24px; background: rgba(20, 23, 28, .38); }
.command-help { width: min(760px, 94vw); max-height: min(760px, 88vh); display: flex; flex-direction: column; overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--shadow-lg); }
.command-help-head { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border-soft); }
.command-help-head > div { flex: 1; min-width: 0; }
.command-help-head h2 { margin: 0; font-size: 18px; }
.command-help-head p { margin: 5px 0 0; color: var(--text-3); font-size: var(--text-sm); }
.command-help-search { display: flex; align-items: center; gap: 9px; margin: 12px 20px 4px; padding: 8px 10px; background: var(--bg-soft); border: 1px solid var(--border-soft); border-radius: var(--r-md); color: var(--text-3); }
.command-help-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; }
.command-help-body { min-height: 0; overflow: auto; padding: 8px 14px 18px; }
.command-help-group h3 { display: flex; align-items: center; gap: 7px; margin: 14px 6px 6px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); }
.command-help-group h3 span { padding: 1px 6px; border-radius: var(--r-full); background: var(--bg-soft); }
.command-help-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 9px 10px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-2); text-align: left; }
.command-help-row.executable { cursor: pointer; }
.command-help-row.executable:hover { background: var(--hover); color: var(--text); }
.command-help-row:disabled { opacity: .72; }
.command-help-name { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 9px; }
.command-help-name code { color: var(--text); font-weight: 600; }
.command-help-name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-3); }
.command-help-status { flex: none; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-3); font-size: var(--text-sm); }
@media (max-width: 640px) { .command-help-overlay { padding: 10px; } .command-help { max-height: 92vh; } .command-help-status { max-width: 42%; } }
</style>
