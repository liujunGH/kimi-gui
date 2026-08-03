<!-- Provider management: inspect all providers and create/edit manual ones. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppModel, AppProvider, AppProviderFormInput } from '../../api/types';
import { providerModelName, parseProviderModelNames } from '../../lib/providerConfig';
import { useDialogFocus } from '../../composables/useDialogFocus';
import Dialog from '../ui/Dialog.vue';
import Button from '../ui/Button.vue';
import Badge from '../ui/Badge.vue';
import Spinner from '../ui/Spinner.vue';
import Field from '../ui/Field.vue';
import Input from '../ui/Input.vue';
import Select from '../ui/Select.vue';
import Icon from '../ui/Icon.vue';
import Tooltip from '../ui/Tooltip.vue';

const { t } = useI18n();
const dialogRef = ref<HTMLElement | null>(null);
useDialogFocus(dialogRef);

const props = defineProps<{
  providers: AppProvider[];
  models?: AppModel[];
  loading?: boolean;
  unavailable?: boolean;
  oauthAvailable?: boolean;
  busyIds?: string[];
  adding?: boolean;
}>();

const emit = defineEmits<{
  add: [input: AppProviderFormInput];
  update: [id: string, input: AppProviderFormInput];
  refresh: [id: string];
  delete: [id: string];
  openLogin: [platform: string];
  close: [];
}>();

const busySet = computed(() => new Set(props.busyIds ?? []));
const PROVIDER_TYPES = ['kimi', 'openai', 'openai_responses', 'anthropic', 'google-genai', 'vertexai'];
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

interface ProviderFormState {
  id: string;
  type: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  modelsText: string;
  newModelContextSize: string;
}

function emptyForm(): ProviderFormState {
  return {
    id: '',
    type: 'openai',
    apiKey: '',
    baseUrl: '',
    defaultModel: '',
    modelsText: '',
    newModelContextSize: '128000',
  };
}

const showAddForm = ref(false);
const addForm = reactive(emptyForm());
const addError = ref('');
const editingId = ref<string | null>(null);
const editingManaged = ref(false);
const editForm = reactive(emptyForm());
const editError = ref('');

function isManagedProvider(provider: AppProvider): boolean {
  return provider.id.startsWith('managed:');
}

function rawModelNames(provider: AppProvider): string[] {
  return (provider.models ?? []).map((model) => providerModelName(provider.id, model));
}

function defaultModelName(provider: AppProvider): string {
  return provider.defaultModel ? providerModelName(provider.id, provider.defaultModel) : '';
}

function contextSizeFor(provider: AppProvider): number {
  const sizes = (props.models ?? [])
    .filter((model) => model.provider === provider.id)
    .map((model) => model.maxContextSize)
    .filter((size) => Number.isFinite(size) && size > 0);
  return sizes[0] ?? 128_000;
}

function openAdd(): void {
  Object.assign(addForm, emptyForm());
  addError.value = '';
  editingId.value = null;
  showAddForm.value = true;
}

function cancelAdd(): void {
  showAddForm.value = false;
  addError.value = '';
}

function openEdit(provider: AppProvider): void {
  showAddForm.value = false;
  editingId.value = provider.id;
  editingManaged.value = isManagedProvider(provider);
  Object.assign(editForm, {
    id: provider.id,
    type: provider.type,
    apiKey: '',
    baseUrl: provider.baseUrl ?? '',
    defaultModel: defaultModelName(provider),
    modelsText: rawModelNames(provider).join('\n'),
    newModelContextSize: String(contextSizeFor(provider)),
  });
  editError.value = '';
}

function cancelEdit(): void {
  editingId.value = null;
  editingManaged.value = false;
  editError.value = '';
}

function formPayload(form: ProviderFormState, requireApiKey: boolean): AppProviderFormInput | string {
  const id = form.id.trim();
  const names = parseProviderModelNames(form.modelsText);
  const contextSize = Number(form.newModelContextSize);
  const defaultModel = form.defaultModel.trim();
  if (!id || !PROVIDER_ID_PATTERN.test(id)) return t('providers.invalidId');
  if (requireApiKey && !form.apiKey.trim()) return t('providers.apiKeyRequired');
  if (names.length === 0) return t('providers.modelsRequired');
  if (!Number.isInteger(contextSize) || contextSize <= 0) return t('providers.invalidContextSize');
  if (defaultModel && !names.includes(defaultModel)) return t('providers.defaultModelInvalid');
  return {
    id,
    type: form.type,
    apiKey: form.apiKey.trim() || undefined,
    baseUrl: form.baseUrl.trim(),
    defaultModel: defaultModel || undefined,
    modelNames: names,
    newModelContextSize: contextSize,
  };
}

function submitAdd(): void {
  const payload = formPayload(addForm, false);
  if (typeof payload === 'string') {
    addError.value = payload;
    return;
  }
  addError.value = '';
  emit('add', { ...payload, baseUrl: payload.baseUrl || undefined });
  showAddForm.value = false;
}

function submitEdit(): void {
  if (!editingId.value || editingManaged.value) return;
  const payload = formPayload(editForm, false);
  if (typeof payload === 'string') {
    editError.value = payload;
    return;
  }
  editError.value = '';
  emit('update', editingId.value, payload);
  editingId.value = null;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (showAddForm.value) { cancelAdd(); return; }
  if (editingId.value) { cancelEdit(); return; }
  emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function statusColor(status: AppProvider['status']): string {
  if (status === 'connected') return 'var(--color-success)';
  if (status === 'error') return 'var(--color-danger)';
  return 'var(--color-text-faint)';
}

function statusLabel(status: AppProvider['status']): string {
  if (status === 'connected') return t('providers.status.connected');
  if (status === 'error') return t('providers.status.error');
  return t('providers.status.unconfigured');
}
</script>

<template>
  <Dialog :open="true" :close-on-esc="false" :title="t('providers.title')" size="xl" height="fixed" @close="emit('close')">
    <div ref="dialogRef" class="pm">
      <div class="prov-list">
        <div v-if="loading" class="state-row">
          <Spinner size="sm" />
          <span>{{ t('providers.loading') }}</span>
        </div>
        <div v-else-if="unavailable" class="state-row unavail">
          <Icon name="alert-triangle" size="md" />
          <span>{{ t('providers.unavailable') }}</span>
        </div>
        <div v-else-if="providers.length === 0" class="empty">{{ t('providers.empty') }}</div>
        <template v-else>
          <div v-for="p in providers" :key="p.id" class="prov-row" :class="{ 'prov-row--open': editingId === p.id }">
            <div class="prov-main">
              <Tooltip :text="statusLabel(p.status)">
                <span
                  class="status-dot"
                  :class="{ 'status-dot--empty': p.status !== 'connected' && p.status !== 'error' }"
                  :style="p.status === 'connected' || p.status === 'error' ? { background: statusColor(p.status) } : undefined"
                />
              </Tooltip>
              <div class="prov-info">
                <div class="prov-heading">
                  <span class="prov-id">{{ p.id }}</span>
                  <Badge variant="neutral" size="sm">{{ p.type }}</Badge>
                  <Badge v-if="isManagedProvider(p)" variant="neutral" size="sm">{{ t('providers.oauthManaged') }}</Badge>
                </div>
                <span v-if="p.baseUrl" class="prov-url">{{ p.baseUrl }}</span>
                <span class="prov-meta">
                  <Badge :variant="p.hasApiKey || isManagedProvider(p) ? 'success' : 'neutral'" size="sm">
                    {{ isManagedProvider(p) ? t('providers.oauthCredential') : (p.hasApiKey ? t('providers.keySet') : t('providers.keyNotSet')) }}
                  </Badge>
                  <span v-if="p.defaultModel">{{ t('providers.defaultModelValue', { model: defaultModelName(p) }) }}</span>
                  <span v-if="p.models?.length">{{ t('providers.modelCount', { count: p.models.length }) }}</span>
                </span>
              </div>
              <div class="prov-actions">
                <Button variant="secondary" size="sm" :disabled="busySet.has(p.id)" @click="openEdit(p)">
                  {{ isManagedProvider(p) ? t('providers.details') : t('providers.edit') }}
                </Button>
                <Tooltip :text="t('providers.refreshTitle', { type: p.type })">
                  <Button variant="secondary" size="sm" :disabled="busySet.has(p.id)" @click="emit('refresh', p.id)">
                    {{ busySet.has(p.id) ? t('providers.processing') : t('providers.refresh') }}
                  </Button>
                </Tooltip>
                <Tooltip :text="t('providers.deleteTitle', { type: p.type })">
                  <Button variant="danger-soft" size="sm" :disabled="busySet.has(p.id) || isManagedProvider(p)" @click="emit('delete', p.id)">
                    {{ t('providers.delete') }}
                  </Button>
                </Tooltip>
              </div>
            </div>

            <div v-if="editingId === p.id" class="edit-panel">
              <div v-if="editingManaged" class="managed-note">
                <Icon name="info" size="sm" />
                <span>{{ t('providers.managedReadonly') }}</span>
              </div>
              <div class="form-grid">
                <Field :label="t('providers.fieldId')">
                  <Input v-model="editForm.id" :readonly="editingManaged" autocomplete="off" spellcheck="false" />
                </Field>
                <Field :label="t('providers.fieldType')">
                  <Select v-model="editForm.type" :disabled="editingManaged">
                    <option v-if="!PROVIDER_TYPES.includes(editForm.type)" :value="editForm.type">{{ editForm.type }}</option>
                    <option v-for="type in PROVIDER_TYPES" :key="type" :value="type">{{ type }}</option>
                  </Select>
                </Field>
              </div>
              <Field :label="t('providers.fieldBaseUrl')">
                <Input v-model="editForm.baseUrl" :readonly="editingManaged" :placeholder="t('providers.baseUrlPlaceholder')" autocomplete="off" spellcheck="false" />
              </Field>
              <Field :label="t('providers.fieldDefaultModel')">
                <Select v-model="editForm.defaultModel" :disabled="editingManaged">
                  <option value="">{{ t('providers.noDefaultModel') }}</option>
                  <option v-for="name in parseProviderModelNames(editForm.modelsText)" :key="name" :value="name">{{ name }}</option>
                </Select>
              </Field>
              <Field v-if="!editingManaged" :label="t('providers.fieldApiKey')" :hint="p.hasApiKey ? t('providers.apiKeyKeepHint') : t('providers.apiKeyOptionalHint')">
                <Input v-model="editForm.apiKey" type="password" :placeholder="p.hasApiKey ? t('providers.apiKeySavedPlaceholder') : 'sk-…'" autocomplete="new-password" spellcheck="false" />
              </Field>
              <Field :label="t('providers.fieldModels')" :hint="t('providers.modelsHint')">
                <textarea v-model="editForm.modelsText" class="form-textarea" :readonly="editingManaged" spellcheck="false" />
              </Field>
              <Field v-if="!editingManaged" :label="t('providers.fieldNewModelContext')" :hint="t('providers.newModelContextHint')">
                <Input v-model="editForm.newModelContextSize" type="number" />
              </Field>
              <div v-if="editError" class="form-error">{{ editError }}</div>
              <div class="form-btns">
                <Button v-if="!editingManaged" variant="primary" size="sm" :disabled="busySet.has(p.id)" @click="submitEdit">{{ t('providers.save') }}</Button>
                <Button variant="secondary" size="sm" @click="cancelEdit">{{ editingManaged ? t('providers.closeDetails') : t('common.cancel') }}</Button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="!unavailable && !editingId" class="add-section">
        <template v-if="!showAddForm">
          <div class="add-btns">
            <Button v-if="oauthAvailable !== false" variant="secondary" size="sm" @click="emit('openLogin', 'moonshot')">
              <Icon name="user" size="sm" />{{ t('providers.loginKimi') }}
            </Button>
            <Button v-if="oauthAvailable !== false" variant="secondary" size="sm" @click="emit('openLogin', 'anthropic')">
              <Icon name="user" size="sm" />{{ t('providers.loginAnthropic') }}
            </Button>
            <Button variant="primary" size="sm" :disabled="adding" @click="openAdd">
              <Icon name="plus" size="sm" />{{ adding ? t('providers.saving') : t('providers.addManual') }}
            </Button>
          </div>
        </template>
        <div v-else class="add-form">
          <div class="form-grid">
            <Field :label="t('providers.fieldId')">
              <Input v-model="addForm.id" :placeholder="t('providers.idPlaceholder')" autocomplete="off" spellcheck="false" />
            </Field>
            <Field :label="t('providers.fieldType')">
              <Select v-model="addForm.type">
                <option v-for="type in PROVIDER_TYPES" :key="type" :value="type">{{ type }}</option>
              </Select>
            </Field>
          </div>
          <Field :label="t('providers.fieldApiKey')" :hint="t('providers.apiKeyOptionalHint')">
            <Input v-model="addForm.apiKey" type="password" placeholder="sk-…" autocomplete="new-password" spellcheck="false" />
          </Field>
          <Field :label="t('providers.fieldBaseUrl')">
            <Input v-model="addForm.baseUrl" :placeholder="t('providers.baseUrlPlaceholder')" autocomplete="off" spellcheck="false" />
          </Field>
          <Field :label="t('providers.fieldModels')" :hint="t('providers.modelsHint')">
            <textarea v-model="addForm.modelsText" class="form-textarea" :placeholder="t('providers.modelsPlaceholder')" spellcheck="false" />
          </Field>
          <div class="form-grid">
            <Field :label="t('providers.fieldDefaultModel')">
              <Select v-model="addForm.defaultModel">
                <option value="">{{ t('providers.noDefaultModel') }}</option>
                <option v-for="name in parseProviderModelNames(addForm.modelsText)" :key="name" :value="name">{{ name }}</option>
              </Select>
            </Field>
            <Field :label="t('providers.fieldNewModelContext')" :hint="t('providers.newModelContextHint')">
              <Input v-model="addForm.newModelContextSize" type="number" />
            </Field>
          </div>
          <div v-if="addError" class="form-error">{{ addError }}</div>
          <div class="form-btns">
            <Button variant="primary" size="sm" @click="submitAdd">{{ t('providers.add') }}</Button>
            <Button variant="secondary" size="sm" @click="cancelAdd">{{ t('common.cancel') }}</Button>
          </div>
        </div>
      </div>

      <div class="security-hint">
        <Icon name="tool" size="sm" />
        <span>{{ t('providers.securityHint') }}</span>
      </div>
      <div class="footer-hint">{{ t('providers.escClose') }}</div>
    </div>
  </Dialog>
</template>

<style scoped>
.pm { display: flex; flex-direction: column; gap: var(--space-4); }
.prov-list { display: flex; flex-direction: column; gap: var(--space-1); }
.state-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-4) 0; color: var(--color-text-muted); font-family: var(--font-ui); font-size: var(--text-base); }
.state-row.unavail { color: var(--color-warning); }
.empty { padding: var(--space-4) 0; color: var(--color-text-muted); font-family: var(--font-ui); font-size: var(--text-base); }
.prov-row { border-bottom: 1px solid var(--color-line); }
.prov-row:last-child { border-bottom: none; }
.prov-row--open { padding-bottom: var(--space-3); }
.prov-main { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
.status-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; box-sizing: border-box; }
.status-dot--empty { background: transparent; border: 1.5px solid var(--color-text-faint); }
.prov-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.prov-heading { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.prov-id { font-family: var(--font-ui); font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--color-text); }
.prov-url { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prov-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-text-muted); }
.prov-actions { display: flex; gap: var(--space-2); flex: none; align-items: center; flex-wrap: wrap; }
.edit-panel, .add-form { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-line); border-radius: var(--radius-lg); background: var(--color-surface-sunken); }
.managed-note, .security-hint { display: flex; align-items: flex-start; gap: var(--space-2); color: var(--color-text-muted); font-family: var(--font-ui); font-size: var(--text-sm); line-height: var(--leading-normal); }
.managed-note { color: var(--color-warning); }
.form-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-3); }
.form-textarea { box-sizing: border-box; width: 100%; min-height: 88px; resize: vertical; border: 1px solid var(--color-line-strong); border-radius: var(--radius-md); background: var(--color-surface-raised); box-shadow: var(--shadow-xs); color: var(--color-text); font-family: var(--font-mono); font-size: var(--text-sm); line-height: var(--leading-normal); padding: var(--space-2) var(--space-3); }
.form-textarea:focus { outline: none; border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.form-textarea[readonly] { background: var(--color-surface-sunken); }
.form-error { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-danger); }
.form-btns, .add-btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.add-section { border-top: 1px solid var(--color-line); padding-top: var(--space-4); }
.security-hint { padding: var(--space-3); border: 1px solid var(--color-line); border-radius: var(--radius-md); background: var(--color-surface-sunken); }
.footer-hint { padding-top: var(--space-2); font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-text-faint); }
@media (max-width: 700px) {
  .prov-main { align-items: flex-start; flex-wrap: wrap; }
  .prov-actions { width: 100%; padding-left: 20px; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
