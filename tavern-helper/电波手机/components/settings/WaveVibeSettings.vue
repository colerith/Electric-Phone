<template>
  <section class="wave-image-settings image-section wave-vibe-settings">
    <div class="image-heading">
      <div><strong>Vibe 参考</strong><small>为这套 NovelAI 配置固定画风与视觉特征</small></div>
      <span class="image-count">{{ modelValue.filter(v => v.enabled).length }} / {{ modelValue.length }}</span>
    </div>
    <p class="image-help">
      与角色参考图叠加使用，合计最多启用 8 张。强度控制影响程度，信息提取度控制从原图提取的信息量。
    </p>
    <div class="image-actions">
      <button type="button" :disabled="modelValue.length >= 8" @click="editorOpen = true">＋ 参考图片</button>
      <button type="button" :disabled="modelValue.length >= 8" @click="fileInput?.click()">导入 Vibe 文件</button>
      <button type="button" @click="loadBaibai">读取柏宝绘</button>
    </div>
    <input ref="fileInput" class="vibe-file-input" type="file" accept=".naiv4vibe,.json" @change="readFile" />
    <div v-if="baibaiList.length" class="image-import-row">
      <WaveSelect
        v-model="baibaiId"
        :options="baibaiList.map(v => ({ value: v.id, label: v.name }))"
        aria-label="柏宝绘 Vibe"
      />
      <button type="button" :disabled="busy" @click="importSelected">{{ busy ? '导入中…' : '添加所选' }}</button>
    </div>
    <p v-if="!modelValue.length" class="image-empty">还没有 Vibe，添加图片或导入已编码的 Vibe 文件。</p>
    <article v-for="vibe in modelValue" :key="vibe.id" class="vibe-card">
      <div class="vibe-card-heading">
        <img v-if="vibe.image" :src="vibe.image" :alt="vibe.name" /><span v-else class="vibe-placeholder"
          ><i class="fa-regular fa-image"></i
        ></span>
        <label
          ><span class="wave-visually-hidden">Vibe 名称</span
          ><input
            :value="vibe.name"
            aria-label="Vibe 名称"
            @change="patch(vibe.id, { name: ($event.target as HTMLInputElement).value })"
          /><small>{{ encodingLabel(vibe) }}</small></label
        >
        <WaveToggle
          :model-value="vibe.enabled"
          :aria-label="`启用 ${vibe.name}`"
          @update:model-value="enabled => patch(vibe.id, { enabled })"
        />
      </div>
      <div class="image-grid">
        <label
          >参考强度<input
            :value="vibe.strength"
            type="number"
            min="0"
            max="1"
            step="0.05"
            @change="number(vibe.id, 'strength', $event)"
        /></label>
        <label
          >信息提取度<input
            :value="
              vibe.image
                ? vibe.informationExtracted
                : (vibe.encodings[vibeModelKey(model)]?.infoExtracted ?? vibe.informationExtracted)
            "
            :disabled="!vibe.image"
            type="number"
            min="0"
            max="1"
            step="0.05"
            @change="number(vibe.id, 'informationExtracted', $event)"
        /></label>
      </div>
      <div class="image-heading">
        <small>{{
          vibe.image ? '生成时编码；模型和信息提取度匹配时复用现有编码。' : '仅含编码，信息提取度随编码固定。'
        }}</small
        ><button
          type="button"
          class="image-danger"
          @click="
            emit(
              'update:modelValue',
              modelValue.filter(v => v.id !== vibe.id),
            )
          "
        >
          移除
        </button>
      </div>
    </article>
    <div class="image-heading">
      <span>总参考强度归一化</span
      ><WaveToggle
        :model-value="normalize"
        aria-label="总参考强度归一化"
        @update:model-value="value => emit('update:normalize', value)"
      />
    </div>
    <p class="image-help">开启后，接口 Vibe 与角色参考图的强度总和超过 1 时按比例缩放。</p>
    <p v-if="status" class="image-status" role="status">{{ status }}</p>
    <WaveImageUpload
      v-if="editorOpen"
      model-value=""
      inline
      purpose="artwork"
      label="Vibe 参考图"
      :max-side="1536"
      :quality="0.9"
      @confirm="addImage"
      @cancel="editorOpen = false"
      @reset="editorOpen = false"
    />
  </section>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { ImageReferenceSchema, type ImageReference } from '../../services/image/schema';
import { vibeModelKey } from '../../services/image/generate';
import { baibaiReferences, importBaibaiReference } from '../../services/image/baibai';
import { parseVibeFile } from '../../services/image/vibe';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveImageUpload from '../shared/WaveImageUpload.vue';
const props = defineProps<{ modelValue: ImageReference[]; model: string; profileId: string; normalize: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: ImageReference[]]; 'update:normalize': [value: boolean] }>();
const fileInput = ref<HTMLInputElement | null>(null),
  editorOpen = ref(false),
  busy = ref(false),
  status = ref('');
const baibaiList = ref<ReturnType<typeof baibaiReferences>>([]),
  baibaiId = ref('');
let revision = 0;
onBeforeUnmount(() => {
  ++revision;
});
watch(
  () => props.profileId,
  () => {
    ++revision;
    editorOpen.value = false;
    status.value = '';
  },
);
function patch(id: string, value: Partial<ImageReference>) {
  emit(
    'update:modelValue',
    props.modelValue.map(v => (v.id === id ? ImageReferenceSchema.parse({ ...v, ...value }) : v)),
  );
}
function number(id: string, field: 'strength' | 'informationExtracted', event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) patch(id, { [field]: Math.max(0, Math.min(1, value)) });
}
function add(value: ImageReference) {
  const rows = props.modelValue.filter(v => v.id !== value.id);
  if (rows.length >= 8) throw Error('每套配置最多保存 8 张 Vibe');
  emit('update:modelValue', [...rows, value]);
  status.value = '已添加 Vibe';
}
function addImage(value: { avatar: string }) {
  if (value.avatar)
    add(
      ImageReferenceSchema.parse({
        id: crypto.randomUUID(),
        name: `Vibe ${props.modelValue.length + 1}`,
        image: value.avatar,
      }),
    );
  editorOpen.value = false;
}
function loadBaibai() {
  baibaiList.value = baibaiReferences();
  baibaiId.value = baibaiList.value[0]?.id || '';
  status.value = baibaiList.value.length ? '选择要导入的 Vibe' : '柏宝绘中暂无已保存的 Vibe';
}
async function importSelected() {
  if (!baibaiId.value || busy.value) return;
  const token = revision;
  busy.value = true;
  try {
    const value = await importBaibaiReference(baibaiId.value);
    if (token === revision) add(value);
  } catch (e) {
    if (token === revision) status.value = e instanceof Error ? e.message : '导入失败';
  } finally {
    busy.value = false;
  }
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const token = revision;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Vibe 文件不能超过 20MB');
    const value = await parseVibeFile(await file.text());
    if (token === revision) add(value);
  } catch (e) {
    if (token === revision) status.value = e instanceof Error ? e.message : 'Vibe 文件读取失败';
  }
}
function encodingLabel(vibe: ImageReference) {
  return vibe.encodings[vibeModelKey(props.model)]
    ? '已有当前模型编码'
    : vibe.image
      ? '原图 · 生成时编码'
      : '缺少当前模型编码，请换模型或补充原图';
}
</script>

<style scoped lang="scss" src="./image-settings.scss"></style>
