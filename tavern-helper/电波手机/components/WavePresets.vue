<template>
  <section class="presets-page wave-settings-surface">
    <div class="presets-summary">
      <span class="presets-kicker">PROMPT LIBRARY</span>
      <h2>让对话有自己的风格</h2>
      <p>当前使用：{{ activeName }}。电波手机请求使用这里的预设；朋友圈读取对应分区。</p>
      <WaveSelect v-model="selectedId" :options="options" aria-label="查看预设" />
      <div class="presets-toolbar">
        <button
          type="button"
          @click="
            nameAction = 'new';
            nameDraft = '';
          "
        >
          ＋ 新建预设</button
        ><button
          type="button"
          @click="
            nameAction = 'copy';
            nameDraft = selectedName + ' 副本';
          "
        >
          复制完整预设
        </button>
      </div>
      <button class="presets-primary" type="button" :disabled="selectedId === library.activeId" @click="activate">
        {{ selectedId === library.activeId ? '正在使用' : '使用此预设' }}
      </button>
    </div>
    <div class="presets-list-heading">
      <div>
        <strong>{{ selectedName }}</strong
        ><small>{{ entries.length }} 个条目 · {{ readonly ? '默认版 · 可切换普通条目' : '修改自动保存' }}</small>
      </div>
      <button
        v-if="!readonly"
        type="button"
        @click="
          nameAction = 'rename';
          nameDraft = selectedName;
        "
      >
        重命名
      </button>
    </div>
    <p v-if="readonly" class="presets-hint">
      默认版允许调整普通条目开关，复制后可编辑内容。电波手机条目始终开启并锁定。
    </p>
    <div v-else class="presets-toolbar">
      <button type="button" @click="editNew(false)">＋ 提示词</button
      ><button type="button" @click="editNew(true)">＋ 分区标题</button
      ><button type="button" @click="deletingPreset = true">删除预设</button>
    </div>
    <div class="presets-entry-list">
      <article
        v-for="(entry, index) in entries"
        :key="entry.id"
        :data-entry-id="entry.id"
        class="preset-entry"
        :class="{
          'is-divider': entry.divider,
          'heading-major': entry.divider && presetHeadingLevel(entry) === 'major',
          'heading-minor': entry.divider && presetHeadingLevel(entry) === 'minor',
          'phone-section-start': isPhonePresetEntry(entry) && (index === 0 || !isPhonePresetEntry(entries[index - 1]!)),
          'is-phone-entry': isPhonePresetEntry(entry),
          'is-disabled': !entry.enabled && !entry.divider,
          'is-dragging': dragIndex === index,
        }"
        @dragover.prevent
        @drop.prevent="drop(index)"
      >
        <div class="preset-entry-top">
          <button
            v-if="!readonly && !isPhonePresetEntry(entry)"
            type="button"
            class="preset-drag"
            draggable="true"
            aria-label="拖动排序"
            @dragstart="dragStart($event, index)"
            @dragend="dragIndex = -1"
            @pointerdown="startTouch($event, index)"
          >
            <i class="fa-solid fa-grip-vertical"></i>
          </button>
          <button type="button" class="preset-entry-title" @click="edit(entry)">
            <strong>{{ entry.divider ? presetHeadingText(entry.name) : entry.name }}</strong
            ><small v-if="!entry.divider"
              >{{ categoryLabel(entry) }} ·
              {{
                entry.kind === 'builtin' ? '酒馆动态来源' : entry.kind === 'runtime' ? '运行时数据' : '提示词'
              }}</small
            >
          </button>
          <WaveToggle
            v-if="!entry.divider"
            :model-value="entry.enabled"
            :disabled="isPhonePresetEntry(entry)"
            :aria-label="entry.name + '启用状态'"
            @update:model-value="toggle(entry, $event)"
          />
        </div>
        <p v-if="!entry.divider" class="preset-entry-preview">
          {{ entry.kind === 'builtin' ? '生成时读取：' + entry.source : entry.content || '空条目' }}
        </p>
        <div v-if="!readonly && !isPhonePresetEntry(entry)" class="preset-entry-actions">
          <button type="button" :disabled="index === 0" aria-label="上移条目" @click="move(index, index - 1)">↑</button
          ><button
            type="button"
            :disabled="index === entries.length - 1"
            aria-label="下移条目"
            @click="move(index, index + 1)"
          >
            ↓</button
          ><button type="button" @click="edit(entry)">编辑</button
          ><button type="button" @click="duplicate(entry.id)">复制</button
          ><button type="button" @click="remove(entry.id)">删除</button>
        </div>
      </article>
    </div>
    <p v-if="notice" role="status" class="presets-hint">{{ notice }}</p>
    <Teleport v-if="surface && (editor || nameAction || deletingPreset)" :to="surface">
      <div class="presets-modal-mask" @click.self="close" @keydown.esc.stop.prevent="close">
        <section
          ref="dialog"
          class="presets-editor wave-settings-surface"
          role="dialog"
          aria-modal="true"
          :aria-label="editor ? (editorReadonly ? '查看条目' : '编辑条目') : deletingPreset ? '删除预设' : '预设名称'"
          tabindex="-1"
          @keydown.tab="trap"
        >
          <header>
            <strong>{{
              editor ? (editorReadonly ? '查看条目' : '编辑条目') : deletingPreset ? '删除预设' : '预设名称'
            }}</strong
            ><button type="button" aria-label="关闭" @click="close">×</button>
          </header>
          <template v-if="editor">
            <label>条目名称<input v-model="editor.name" :readonly="editorReadonly" maxlength="160" /></label>
            <label class="preset-check"
              ><input
                v-model="editor.divider"
                type="checkbox"
                :disabled="editorReadonly"
              />作为功能分区标题（不发送）</label
            >
            <WaveSelect
              v-if="editor.divider"
              :model-value="editor.headingLevel || presetHeadingLevel(editor)"
              :options="[
                { value: 'major', label: '大标题' },
                { value: 'minor', label: '小标题' },
              ]"
              :disabled="editorReadonly"
              aria-label="标题级别"
              @update:model-value="editor.headingLevel = $event as 'major' | 'minor'"
            />
            <template v-if="!editor.divider">
              <WaveSelect
                :model-value="editor.category || presetCategory(editor)"
                :options="categoryOptions"
                :disabled="editorReadonly"
                aria-label="条目分类"
                @update:model-value="editor.category = $event as PresetItem['category']"
              />
              <WaveSelect
                v-model="editor.scope"
                :options="scopeOptions"
                :disabled="editorReadonly"
                aria-label="生效范围"
              />
              <WaveSelect
                v-model="editor.kind"
                :options="kindOptions"
                :disabled="editorReadonly"
                aria-label="条目类型"
              />
              <WaveSelect
                v-if="editor.kind === 'builtin'"
                :model-value="editor.source || 'user_input'"
                :options="sourceOptions"
                :disabled="editorReadonly"
                aria-label="酒馆动态来源"
                @update:model-value="editor.source = $event as PresetItem['source']"
              />
              <label v-else>提示词内容<textarea v-model="editor.content" :readonly="editorReadonly" rows="12" /></label>
              <p v-if="editor.kind === 'runtime'">保留原有双花括号变量，生成时会替换为当前手机数据。</p>
            </template>
            <button v-if="!editorReadonly" type="button" class="presets-primary" @click="saveEditor">保存条目</button>
          </template>
          <template v-else-if="nameAction"
            ><label>预设名称<input v-model="nameDraft" maxlength="80" @keydown.enter.prevent="saveName" /></label>
            <p v-if="nameAction === 'new'">包含电波手机系统规则、酒馆动态来源和朋友圈条目，可继续添加风格分区。</p>
            <button type="button" class="presets-primary" @click="saveName">保存预设</button></template
          >
          <template v-else
            ><p>删除“{{ selectedName }}”？正在使用的预设被删除后会切回默认版。</p>
            <button type="button" class="presets-primary" @click="deletePreset">确认删除</button></template
          >
          <p v-if="error" role="alert">{{ error }}</p>
        </section>
      </div>
    </Teleport>
  </section>
</template>
<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, watch } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../stores/phone';
import { resolvePresetEntries } from '../prompts';
import {
  createPreset,
  editablePreset,
  movePresetEntry,
  savePresetEntry,
  deletePresetEntry,
  copyPresetEntry,
  togglePresetEntry,
} from '../services/presets';
import {
  isPresetDivider,
  isPhonePresetEntry,
  presetCategory,
  presetHeadingText,
  presetHeadingLevel,
  type PresetItem,
} from '../services/preset-schema';
import { phoneSurfaceKey } from '../services/ui-context';
import WaveSelect from './WaveSelect.vue';
import WaveToggle from './WaveToggle.vue';
const phone = usePhoneStore(),
  surface = inject(phoneSurfaceKey, ref(null)),
  library = computed(() => phone.settings.presets);
const selectedId = ref(library.value.activeId);
const readonly = computed(() => selectedId.value === 'default'),
  selected = computed(() => library.value.items.find(item => item.id === selectedId.value));
const entries = computed(() => resolvePresetEntries({ ...library.value, activeId: selectedId.value })),
  selectedName = computed(() => (readonly.value ? '电波手机 · 默认' : selected.value?.name || '未选择'));
const activeName = computed(
  () => library.value.items.find(item => item.id === library.value.activeId)?.name || '电波手机 · 默认',
);
const options = computed(() => [
  { value: 'default', label: '电波手机 · 默认', description: '内置 · 普通条目可开关' },
  ...library.value.items.map(item => ({ value: item.id, label: item.name })),
]);
const scopeOptions = [
  { value: 'all', label: '私聊与空间' },
  { value: 'chat', label: '私聊' },
  { value: 'zone', label: '空间' },
  { value: 'moments', label: '朋友圈' },
];
const kindOptions = [
  { value: 'custom', label: '自定义提示词' },
  { value: 'builtin', label: '酒馆动态来源' },
  { value: 'runtime', label: '手机运行时数据' },
];
const sourceOptions = [
  'world_info_before',
  'char_description',
  'char_personality',
  'scenario',
  'persona_description',
  'chat_history',
  'world_info_after',
  'dialogue_examples',
  'user_input',
].map(value => ({ value, label: value }));
const categoryOptions = [
  { value: 'chat', label: '私聊' },
  { value: 'system', label: '系统' },
  { value: 'app', label: '应用' },
  { value: 'nsfw', label: 'NSFW' },
];
const categoryLabel = (entry: PresetItem) => categoryOptions.find(item => item.value === presetCategory(entry))?.label;
const editor = ref<PresetItem | null>(null),
  nameAction = ref<'' | 'new' | 'copy' | 'rename'>(''),
  nameDraft = ref(''),
  deletingPreset = ref(false),
  notice = ref(''),
  error = ref(''),
  dialog = ref<HTMLElement | null>(null),
  dragIndex = ref(-1);
const editorReadonly = computed(() => readonly.value || (!!editor.value && isPhonePresetEntry(editor.value)));
function save() {
  phone.saveSettings();
}
function activate() {
  library.value.activeId = selectedId.value;
  save();
  notice.value = '已切换，下次生成生效';
}
function edit(entry: PresetItem) {
  editor.value = { ...klona(entry), category: presetCategory(entry), headingLevel: presetHeadingLevel(entry) };
  error.value = '';
}
function editNew(divider: boolean) {
  editor.value = {
    id: 'new',
    order: entries.value.length,
    name: divider ? '✧─新分区─✧' : '新条目',
    enabled: true,
    kind: 'custom',
    scope: 'all',
    category: 'chat',
    headingLevel: 'minor',
    content: '',
    divider,
  };
}
function saveEditor() {
  try {
    if (!editor.value) return;
    if (editor.value.kind === 'builtin' && !editor.value.source) editor.value.source = 'user_input';
    savePresetEntry(library.value, selectedId.value, editor.value);
    save();
    close();
  } catch (e) {
    error.value = String(e);
  }
}
function toggle(entry: PresetItem, value: boolean) {
  if (isPhonePresetEntry(entry)) return;
  togglePresetEntry(library.value, selectedId.value, entry, value);
  save();
}
function remove(id: string) {
  deletePresetEntry(library.value, selectedId.value, id);
  save();
}
function duplicate(id: string) {
  copyPresetEntry(library.value, selectedId.value, id);
  save();
}
function move(from: number, to: number) {
  movePresetEntry(library.value, selectedId.value, from, to);
  save();
}
function dragStart(event: DragEvent, index: number) {
  dragIndex.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function drop(index: number) {
  if (dragIndex.value >= 0) move(dragIndex.value, index);
  dragIndex.value = -1;
}
let stopTouch = () => {};
function startTouch(event: PointerEvent, index: number) {
  if (event.pointerType === 'mouse') return;
  event.preventDefault();
  stopTouch();
  dragIndex.value = index;
  const doc = (event.currentTarget as HTMLElement).ownerDocument;
  let targetIndex = index;
  const update = (e: PointerEvent) => {
    const row = doc.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-entry-id]');
    if (row) {
      targetIndex = entries.value.findIndex(item => item.id === row.dataset.entryId);
      row.scrollIntoView({ block: 'nearest' });
    }
  };
  const finish = () => {
    stopTouch();
    if (targetIndex >= 0) drop(targetIndex);
    else dragIndex.value = -1;
  };
  const cancel = () => {
    stopTouch();
    dragIndex.value = -1;
  };
  stopTouch = () => {
    doc.removeEventListener('pointermove', update);
    doc.removeEventListener('pointerup', finish);
    doc.removeEventListener('pointercancel', cancel);
  };
  doc.addEventListener('pointermove', update);
  doc.addEventListener('pointerup', finish);
  doc.addEventListener('pointercancel', cancel);
}
onUnmounted(() => stopTouch());
function saveName() {
  try {
    if (!nameDraft.value.trim()) throw new Error('请输入预设名称');
    if (nameAction.value === 'rename') editablePreset(library.value, selectedId.value).name = nameDraft.value.trim();
    else
      selectedId.value = createPreset(
        library.value,
        nameDraft.value,
        nameAction.value === 'copy' ? klona(entries.value) : undefined,
      ).id;
    save();
    close();
  } catch (e) {
    error.value = String(e);
  }
}
function deletePreset() {
  editablePreset(library.value, selectedId.value);
  library.value.items = library.value.items.filter(item => item.id !== selectedId.value);
  if (library.value.activeId === selectedId.value) library.value.activeId = 'default';
  selectedId.value = 'default';
  save();
  close();
}
function close() {
  editor.value = null;
  nameAction.value = '';
  deletingPreset.value = false;
  error.value = '';
}
watch(
  () => editor.value?.name,
  name => {
    if (editor.value && !readonly.value && name && isPresetDivider(name)) editor.value.divider = true;
  },
);
let previous: HTMLElement | null = null;
watch(
  () => !!editor.value || !!nameAction.value || deletingPreset.value,
  async open => {
    if (open) {
      previous = surface.value?.ownerDocument.activeElement as HTMLElement | null;
      await nextTick();
      (dialog.value?.querySelector<HTMLElement>('input') || dialog.value)?.focus();
    } else if (previous?.isConnected) previous.focus();
  },
);
function trap(event: KeyboardEvent) {
  const list = [
      ...(dialog.value?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled)',
      ) || []),
    ],
    first = list[0],
    last = list.at(-1),
    active = dialog.value?.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || active === dialog.value)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}
</script>
