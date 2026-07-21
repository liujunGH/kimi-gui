<script setup lang="ts">
/**
 * Composer —— 输入区(空闲单输入 / 运行双模 + 补全 + 弹层簇)
 *
 * 组件内行为(kimi3 域):
 * - `/` 与 `@` 补全检测,联动 SlashMenu / MentionMenu(选中回填 / 直接执行)
 * - ⌘+Enter 发送;运行态 stop = emit('cancel')
 * - ↑/↓ shell 式输入历史召回(useInputHistory,按 sessionId 分会话持久化;
 *   光标在文本起始处才进入召回,手动打字退出浏览态,菜单开着时 ↑↓ 归菜单,
 *   IME 组词中不触发)
 * - 未发送草稿持久化(useComposerDraft,按 sessionId 存 localStorage,
 *   切会话/刷新不丢;未传 sessionId 时退化为全局单草稿)
 * - placeholder 随 running/mode 切换;steer 模式 placeholder 染 warning 色
 *
 * 弹层簇(PermPicker / ModePicker / ContextMeter / ModelPicker)与补全菜单
 * (SlashMenu / MentionMenu)为独立组件,各自管理弹层开合与键盘导航。
 *
 * 契约外补充 props(已报备):builtin / skills / files —— 补全数据源,
 * 原型期由场景传入 mock,轮次 3 由 ZCode 的 composable 接真源。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type {
  BuiltinCommand,
  ComposerProps,
  ComposerEmits,
  FileEntry,
  Skill,
} from '../../../types/codex';
import { useComposerDraft } from '../../../composables/useComposerDraft';
import { useInputHistory } from '../../../composables/useInputHistory';
import CodexIcon from '../layout/CodexIcon.vue';
import { useToast } from '../layout/Toast.vue';
import ComposerModes from './ComposerModes.vue';
import PermPicker from './PermPicker.vue';
import ModePicker from './ModePicker.vue';
import WorkspacePicker from '../layout/WorkspacePicker.vue';
import ContextMeter from './ContextMeter.vue';
import ModelPicker from './ModelPicker.vue';
import SlashMenu from './SlashMenu.vue';
import MentionMenu from './MentionMenu.vue';

const props = withDefaults(
  defineProps<
    ComposerProps & {
      builtin?: BuiltinCommand[];
      skills?: Skill[];
      files?: FileEntry[];
      /** 服务端文件搜索(daemon searchFiles);提供后 @ 菜单走真搜索,不再过滤静态 files */
      searchFiles?: (q: string) => Promise<FileEntry[]>;
      sessionTitle?: string;
      placeholder?: string;
      /** 当前会话 id —— 草稿与输入历史按会话隔离;未传时退化为全局单草稿 */
      sessionId?: string;
      /** 会话累计成本(USD),透传给 ContextMeter */
      cost?: number;
      /** 图片上传(daemon uploadImage);提供后 paste/drop 可上传图片 */
      uploadImage?: (file: Blob, name?: string) => Promise<{ fileId: string; name: string; mediaType: string } | null>;
    }
  >(),
  { builtin: () => [], skills: () => [], files: () => [], sessionTitle: '', placeholder: '' },
);
const emit = defineEmits<ComposerEmits>();

// 文本状态 + 按会话草稿持久化(textareaRef/autosize 同时供输入历史用)——见 useComposerDraft
const { text, textareaRef, autosize, loadForEdit, clearDraft } = useComposerDraft({
  sessionId: () => props.sessionId,
});

// shell 式 ↑/↓ 已发消息召回 —— 见 useInputHistory;键位编排留在本组件(见 onKeydown)
const history = useInputHistory({ text, textareaRef, autosize, sessionId: () => props.sessionId });
const { toast } = useToast();

/** 补全检测:'/' 开头单 token → slash;最后 token 以 @ 起头 → mention */
const assist = computed(() => {
  const v = text.value;
  const slash = v.match(/^\/(\w*)$/);
  if (slash) return { mode: 'slash' as const, query: (slash[1] ?? '').toLowerCase() };
  const at = v.match(/(?:^|\s)@([^\s@]*)$/);
  if (at) return { mode: 'at' as const, query: (at[1] ?? '').toLowerCase(), atStart: v.lastIndexOf('@') };
  return null;
});

/** Esc 关闭补全后,文本再变前抑制重开 */
const assistDismissed = ref(false);
/**
 * 历史召回改写 text 时置位:该次变化不解除补全抑制(否则召回 '/cmd' 类
 * 文本会重开菜单,把继续按 ↑ 的键位劫走)。仅当召回真的改了文本才置位。
 */
let recallArmed = false;
watch(text, () => {
  if (recallArmed) {
    recallArmed = false;
    return;
  }
  assistDismissed.value = false;
});
const assistVisible = computed(() => (assistDismissed.value ? null : assist.value));
function closeAssist() {
  assistDismissed.value = true;
}

function onSlashSelect(cmd: BuiltinCommand | Skill) {
  const name = (cmd as BuiltinCommand).name ?? '';
  if ((cmd as BuiltinCommand).acceptsInput) {
    text.value = '/' + name + ' ';
  } else {
    /* 无参命令:emit command 让父级执行(不走 send,避免当普通消息发);
       与官方一致,命令也进输入历史(↑ 可召回) */
    history.push('/' + name);
    emit('command', '/' + name);
    text.value = '';
    clearDraft();
  }
}
function onAtSelect(file: FileEntry) {
  const a = assist.value;
  if (a?.mode === 'at') {
    text.value = text.value.slice(0, a.atStart) + '@' + file.path + ' ';
  }
}

const placeholder = computed(() => {
  if (props.placeholder) return props.placeholder;
  if (props.running && props.mode === 'steer') return '输入将立即插话到当前运行的轮次…';
  if (props.running) return '输入会排队 · 当前轮结束后自动发送下一条';
  return '给 Kimi 下达任务,Enter 发送';
});

/** ContextMeter 展示用的模型名:优先 models 里的 displayName,否则剥掉 provider 前缀 */
const displayModelName = computed(() => {
  const found = props.models.find((m) => m.id === props.currentModel);
  if (found) return found.name;
  return props.currentModel.includes('/')
    ? (props.currentModel.split('/').pop() ?? props.currentModel)
    : props.currentModel;
});

/** 当前工作区名(静态展示用:有会话时不可切换,草稿态才可点选) */
const currentWsName = computed(() => {
  if (!props.currentWorkspaceId) return '';
  return props.workspaces?.find((w) => w.id === props.currentWorkspaceId)?.name ?? props.currentWorkspaceId;
});

const canSend = computed(() => text.value.trim().length > 0 || attachments.value.some((a) => a.fileId && !a.uploading && !a.error));

function submit() {
  if (attachments.value.some((a) => a.uploading)) return;
  if (!canSend.value) return;
  const atts = buildAttachments();
  // 进历史(↑ 可召回)再发送;push 内部忽略空串与无 session 的草稿态
  history.push(text.value.trim());
  emit('send', text.value.trim(), props.mode, atts.length ? atts : undefined);
  text.value = '';
  // 同步清掉持久化草稿:不能依赖 text watcher(组件可能在 watcher flush 前卸载)
  clearDraft();
  clearAttachments();
}

function onKeydown(e: KeyboardEvent) {
  // IME 组词中不拦截任何键(isComposing + keyCode 229 双保险,同官方)
  if (e.isComposing || e.keyCode === 229) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    submit();
    return;
  }

  // Enter 直接发送(Shift+Enter 换行;补全菜单开着时 Enter 归菜单)
  if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !assistVisible.value) {
    e.preventDefault();
    submit();
    return;
  }

  // 历史召回(shell 式 ↑/↓):
  // - 补全菜单开着时 ↑↓ 归菜单(SlashMenu/MentionMenu 挂在 window keydown 上,
  //   冒泡阶段在 textarea 之后触发,故这里必须让路)
  // - 进入召回要求光标在文本起始处(多行草稿内正常移动光标不被劫持);
  //   进入浏览态后 ↑↓ 直接走历史,打字(@input → resetBrowsing)退出
  if (!assistVisible.value && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
    const browsing = history.isBrowsing();
    if (e.key === 'ArrowUp' && history.hasHistory() && (browsing || history.caretAtTextStart())) {
      e.preventDefault();
      const before = text.value;
      assistDismissed.value = true; // 召回 '/cmd' 类文本也别重开菜单
      history.recallOlder();
      if (text.value !== before) recallArmed = true;
      return;
    }
    if (e.key === 'ArrowDown' && browsing) {
      e.preventDefault();
      const before = text.value;
      assistDismissed.value = true;
      history.recallNewer();
      if (text.value !== before) recallArmed = true;
      return;
    }
  }
}

/** 手动打字退出历史浏览态(召回是程序化改 text,不触发 @input) */
function onInput() {
  history.resetBrowsing();
}

/** 供父组件回填文本(队列「编辑」/「编辑重发」→ 拉回输入框,光标移到末尾) */
function setText(t: string) {
  loadForEdit(t);
}

// ---------- 附件上传(paste / drop / file picker) ----------
interface PendingAttachment {
  localId: string;
  name: string;
  url: string;
  uploading: boolean;
  error: boolean;
  fileId?: string;
  mediaType?: string;
}
const attachments = ref<PendingAttachment[]>([]);
const fileInputEl = ref<HTMLInputElement | null>(null);

async function handleFiles(files: FileList | File[]) {
  if (!props.uploadImage) return;
  const arr = Array.from(files);
  let rejected = 0;
  for (const file of arr) {
    const isImage = file.type.startsWith('image/') || file.type.startsWith('video/');
    if (!isImage) {
      rejected++;
      continue;
    }
    const att: PendingAttachment = {
      localId: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      uploading: true,
      error: false,
    };
    attachments.value.push(att);
    try {
      const result = await props.uploadImage(file, file.name);
      if (result) {
        att.fileId = result.fileId;
        att.mediaType = result.mediaType;
      } else {
        att.error = true;
      }
    } catch {
      att.error = true;
    } finally {
      att.uploading = false;
    }
  }
  // 不支持的类型不再静默吞掉(普通文件上传是协议侧待排期项)
  if (rejected) toast(`${rejected} 个文件暂不支持(仅图片/视频),可用 @ 引用文件`);
}

function removeAttachment(localId: string) {
  const idx = attachments.value.findIndex((a) => a.localId === localId);
  if (idx >= 0) {
    URL.revokeObjectURL(attachments.value[idx]!.url);
    attachments.value.splice(idx, 1);
  }
}

function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files;
  if (files && files.length > 0) {
    e.preventDefault();
    void handleFiles(files);
  }
}

function onDrop(e: DragEvent) {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  void handleFiles(e.dataTransfer.files);
}

function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
}

function pickFile() {
  fileInputEl.value?.click();
}

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) void handleFiles(input.files);
  input.value = '';
}

// 发送时携带附件(构建 PromptAttachment[])
function buildAttachments(): { fileId: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[] {
  return attachments.value
    .filter((a) => a.fileId && !a.uploading && !a.error)
    .map((a) => ({
      fileId: a.fileId!,
      kind: (a.mediaType?.startsWith('video/') ? 'video' : 'image') as 'image' | 'video' | 'file',
      url: a.url,
      name: a.name,
    }));
}

function clearAttachments() {
  for (const a of attachments.value) URL.revokeObjectURL(a.url);
  attachments.value = [];
}

/** 聚焦输入框(新建任务后调用) */
function focus() {
  textareaRef.value?.focus();
}

onMounted(() => {
  // 挂载时若有恢复出来的草稿,先拟合一次高度(autosize 平时由 text watcher 驱动)
  if (text.value) void nextTick(autosize);
});

defineExpose({ setText, focus });
</script>

<template>
  <div
    class="composer"
    :class="{ 'is-running': props.running, 'mode-steer-on': props.mode === 'steer' }"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <SlashMenu
      v-if="assistVisible?.mode === 'slash'"
      :builtin="props.builtin"
      :skills="props.skills"
      :query="assistVisible.query"
      :skills-loading="false"
      @select="onSlashSelect"
      @close="closeAssist"
    />
    <MentionMenu
      v-if="assistVisible?.mode === 'at'"
      :files="props.files"
      :query="assistVisible.query"
      :files-loading="false"
      :search="props.searchFiles"
      @select="onAtSelect"
      @close="closeAssist"
    />

    <ComposerModes v-if="props.running" :mode="props.mode" @set-mode="(m) => emit('set-mode', m)" />

    <!-- 附件 chips -->
    <div v-if="attachments.length" class="att-strip">
      <div
        v-for="att in attachments"
        :key="att.localId"
        class="att-chip"
        :class="{ uploading: att.uploading, error: att.error }"
      >
        <img v-if="att.url" :src="att.url" class="att-thumb" />
        <span class="att-name">{{ att.name }}</span>
        <span v-if="att.uploading" class="att-status">上传中…</span>
        <span v-else-if="att.error" class="att-status err">失败</span>
        <button class="att-remove" @click="removeAttachment(att.localId)"><CodexIcon name="x" /></button>
      </div>
    </div>

    <input
      ref="fileInputEl"
      type="file"
      accept="image/*,video/*"
      multiple
      style="display:none"
      @change="onFileInputChange"
    />

    <div class="composer-input">
      <textarea
        ref="textareaRef"
        v-model="text"
        rows="1"
        :placeholder="placeholder"
        @keydown="onKeydown"
        @input="onInput"
        @paste="onPaste"
      ></textarea>
    </div>

    <div class="composer-toolbar">
      <div class="toolbar-group">
        <button v-if="props.uploadImage" class="attach-btn" title="添加图片附件" @click="pickFile">
          <CodexIcon name="paperclip" />
        </button>
        <WorkspacePicker
          v-if="props.workspaces && props.workspaces.length && !props.sessionId"
          trigger="pill"
          :workspaces="props.workspaces as any"
          :current-id="props.currentWorkspaceId ?? ''"
          @select="(id: string) => emit('select-workspace', id)"
          @add-workspace="(p: string) => emit('add-workspace', p)"
        />
        <span
          v-else-if="props.workspaces && props.workspaces.length && props.sessionId && currentWsName"
          class="perm-pill ws-static"
          title="工作区在会话创建后固定,不可切换"
        >
          <CodexIcon name="file" />
          <span class="ellipsis wp-pill-name">{{ currentWsName }}</span>
        </span>
        <PermPicker :permission="props.permission" @set-permission="(p) => emit('set-permission', p)" />
        <ModePicker :modes="props.modes" @toggle-mode="(m) => emit('toggle-mode', m)" />
      </div>
      <div class="toolbar-group right">
        <ContextMeter
          :context="props.context"
          :quota="props.quota"
          :session-title="props.sessionTitle"
          :running="props.running"
          :permission="props.permission"
          :model="displayModelName"
          :effort="props.effort"
          :cost="props.cost"
          @open-detail="emit('open-context-detail')"
        />
        <ModelPicker
          :models="props.models"
          :current="props.currentModel"
          :effort="props.effort"
          @set-model="(id) => emit('set-model', id)"
          @set-effort="(lv) => emit('set-effort', lv)"
          @pick-model="emit('pick-model')"
        />
        <button
          v-if="!props.running"
          class="composer-send"
          :disabled="!canSend"
          title="发送 ⌘+Enter"
          @click="submit"
        >
          <CodexIcon name="arrow-up" />
        </button>
        <button v-else class="composer-send stop" title="中断" @click="emit('cancel')">
          <CodexIcon name="stop" />
        </button>
      </div>
    </div>
  </div>
</template>
