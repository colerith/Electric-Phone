<template>
  <div class="wave-image-upload">
    <button
      v-if="!inline"
      class="wave-image-preview"
      type="button"
      :aria-label="`${label}：点击修改`"
      @click="openEditor"
    >
      <img v-if="displayValue" :src="displayValue" :alt="label" :style="avatarTransform" @error="imageFailed = true" />
      <span v-else class="wave-image-fallback"><i class="fa-solid fa-user-astronaut"></i></span>
      <span class="wave-image-edit"><i class="fa-solid fa-camera"></i> 修改</span>
    </button>

    <Teleport v-if="surface" :to="surface">
      <div
        v-if="opened"
        class="wave-image-modal"
        @click.self="closeEditor"
        @keydown.esc.stop.prevent="closeEditor"
        @keydown.tab="trapFocus"
      >
        <div
          ref="dialog"
          class="wave-upload-subpage"
          role="dialog"
          aria-modal="true"
          :aria-label="`修改${label}`"
          tabindex="-1"
        >
          <div class="wave-upload-dialog" :aria-label="`修改${label}`">
            <div class="wave-dialog-bar">
              <button class="wave-modal-close" type="button" aria-label="关闭图片编辑" @click="closeEditor">
                <span aria-hidden="true">×</span>
              </button>
              <span>
                <small>IMAGE UPLOAD</small>
                <strong>修改{{ label }}</strong>
              </span>
            </div>

            <div v-if="purpose === 'avatar'" class="wave-crop-caption">
              <span><strong>头像显示选区</strong><small>移动与缩放只影响电波手机内的头像</small></span>
              <button type="button" @click="resetCrop"><i class="fa-solid fa-arrows-to-dot"></i> 居中</button>
            </div>

            <div
              class="wave-upload-preview"
              :class="{ 'artwork-preview': purpose === 'artwork' }"
              @pointerdown="startCropDrag"
              @pointermove="moveCropDrag"
              @pointerup="endCropDrag"
              @pointercancel="endCropDrag"
            >
              <img v-if="draftValue" :src="draftValue" :alt="`${label}预览`" :style="draftTransform" />
              <span v-else><i class="fa-solid fa-image"></i></span>
              <i v-if="purpose === 'avatar'" class="wave-crop-frame" aria-hidden="true"></i>
            </div>

            <div v-if="purpose === 'avatar'" class="wave-avatar-size-preview" aria-label="小头像效果预览">
              <span v-for="size in previewSizes" :key="size" :style="{ width: `${size}px`, height: `${size}px` }">
                <img v-if="draftValue" :src="draftValue" alt="" :style="draftTransform" />
                <i v-else class="fa-solid fa-user"></i>
              </span>
              <small>24 / 40 / 58 px 实际显示效果</small>
            </div>

            <div v-if="purpose === 'avatar'" class="wave-crop-controls">
              <label>
                <span
                  ><i class="fa-solid fa-magnifying-glass-plus"></i> 显示大小 <b>{{ zoomLabel }}</b></span
                >
                <WaveSlider v-model="draftZoom" :min="1" :max="2.5" :step="0.05" aria-label="头像显示大小" />
              </label>
              <label>
                <span
                  ><i class="fa-solid fa-arrows-left-right"></i> 水平选区
                  <b>{{ panLimit ? draftOffsetX : '请先放大' }}</b></span
                >
                <WaveSlider
                  v-model="draftOffsetX"
                  :min="-panLimit"
                  :max="panLimit"
                  :disabled="panLimit === 0"
                  aria-label="头像水平选区"
                />
              </label>
              <label>
                <span
                  ><i class="fa-solid fa-arrows-up-down"></i> 垂直选区
                  <b>{{ panLimit ? draftOffsetY : '请先放大' }}</b></span
                >
                <WaveSlider
                  v-model="draftOffsetY"
                  :min="-panLimit"
                  :max="panLimit"
                  :disabled="panLimit === 0"
                  aria-label="头像垂直选区"
                />
              </label>
            </div>

            <input ref="fileInput" class="wave-visually-hidden" type="file" accept="image/*" @change="readFile" />
            <button class="wave-upload-file" type="button" @click="fileInput?.click()">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>
              <span
                ><strong>从本地选择图片</strong><small>自动压缩，最大边 {{ maxSide }}px</small></span
              >
            </button>

            <label class="wave-field-label" :for="`wave-image-url-${purpose}`">图片地址</label>
            <input
              :id="`wave-image-url-${purpose}`"
              v-model.trim="draftValue"
              class="wave-text-field"
              type="text"
              inputmode="url"
              placeholder="https://… 或 /characters/…"
            />
            <p v-if="errorText" class="wave-field-error">{{ errorText }}</p>
            <p v-else class="wave-field-help">
              {{
                purpose === 'avatar'
                  ? '支持酒馆内部头像、本地图片和公开 http/https 图片地址。'
                  : '支持本地图片和公开 http/https 图片地址。'
              }}
            </p>

            <div class="wave-upload-actions">
              <button type="button" @click="resetToCard">
                <i class="fa-solid fa-rotate-left"></i> {{ purpose === 'avatar' ? '恢复卡片头像' : '恢复默认图案' }}
              </button>
              <button class="primary-action" type="button" @click="confirm">
                <i class="fa-solid fa-floppy-disk"></i> 保存{{ label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount, inject } from 'vue';
import WaveSlider from './WaveSlider.vue';
import { phoneSurfaceKey } from '../services/ui-context';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    fallback?: string;
    label?: string;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
    maxSide?: number;
    quality?: number;
    inline?: boolean;
    purpose?: 'avatar' | 'artwork';
  }>(),
  {
    fallback: '',
    label: '角色头像',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    maxSide: 1200,
    quality: 0.82,
    inline: false,
    purpose: 'avatar',
  },
);
const emit = defineEmits<{
  confirm: [value: { avatar: string; zoom: number; offsetX: number; offsetY: number }];
  reset: [];
  cancel: [];
}>();

const surface = inject(phoneSurfaceKey, ref(null));
const opened = ref(false);
const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
function openEditor() {
  previousFocus = surface.value?.ownerDocument.activeElement as HTMLElement | null;
  loadDraft();
  opened.value = true;
  void nextTick(() => dialog.value?.focus());
}
function closeEditor() {
  opened.value = false;
  emit('cancel');
  previousFocus?.focus();
}
function trapFocus(event: KeyboardEvent) {
  const items = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="file"]), [tabindex="0"]',
    ) || [],
  );
  const first = items[0],
    last = items.at(-1);
  if (event.shiftKey && (event.target === first || event.target === dialog.value)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault();
    first?.focus();
  }
}
onBeforeUnmount(() => {
  previousFocus?.focus();
});
const fileInput = ref<HTMLInputElement | null>(null);
const draftValue = ref('');
const draftZoom = ref(1);
const draftOffsetX = ref(0);
const draftOffsetY = ref(0);
const errorText = ref('');
const imageFailed = ref(false);
const previewSizes = [24, 40, 58];
const displayValue = computed(() => (imageFailed.value ? '' : props.modelValue || props.fallback));
const avatarTransform = computed(() => makeTransform(props.zoom, props.offsetX, props.offsetY));
const draftTransform = computed(() => makeTransform(draftZoom.value, draftOffsetX.value, draftOffsetY.value));
const zoomLabel = computed(() => `${Math.round(draftZoom.value * 100)}%`);
const panLimit = computed(() => Math.max(0, Math.min(60, Math.floor(((draftZoom.value - 1) * 50) / 0.32))));
let cropDrag: { pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null = null;

watch(
  () => props.modelValue,
  () => {
    imageFailed.value = false;
  },
);

function loadDraft(): void {
  draftValue.value = props.modelValue || props.fallback;
  draftZoom.value = props.zoom;
  draftOffsetX.value = props.offsetX;
  draftOffsetY.value = props.offsetY;
  errorText.value = '';
}

function makeTransform(zoom: number, offsetX: number, offsetY: number): Record<string, string> {
  const maximumTranslation = Math.max(0, (zoom - 1) * 50);
  const translateX = _.clamp(offsetX * 0.32, -maximumTranslation, maximumTranslation);
  const translateY = _.clamp(offsetY * 0.32, -maximumTranslation, maximumTranslation);
  return {
    objectPosition: 'center',
    transform: `translate3d(${translateX}%, ${translateY}%, 0) scale(${zoom})`,
    transformOrigin: 'center',
  };
}

function isAllowedImageSource(value: string): boolean {
  if (!value) return true;
  if (value.startsWith('data:image/') || /^https?:\/\//i.test(value)) return true;
  return /^(?:\/|\.{1,2}\/|characters\/|thumbnail\?)[^\s]+$/.test(value);
}

function resetCrop(): void {
  draftZoom.value = 1;
  draftOffsetX.value = 0;
  draftOffsetY.value = 0;
}

function startCropDrag(event: PointerEvent): void {
  if (props.purpose === 'artwork') return;
  if (!draftValue.value) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  cropDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: draftOffsetX.value,
    offsetY: draftOffsetY.value,
  };
}

function moveCropDrag(event: PointerEvent): void {
  if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
  draftOffsetX.value = Math.round(
    _.clamp(cropDrag.offsetX + (event.clientX - cropDrag.startX) / 2, -panLimit.value, panLimit.value),
  );
  draftOffsetY.value = Math.round(
    _.clamp(cropDrag.offsetY + (event.clientY - cropDrag.startY) / 2, -panLimit.value, panLimit.value),
  );
}

function endCropDrag(event: PointerEvent): void {
  if (cropDrag?.pointerId !== event.pointerId) return;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  cropDrag = null;
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error('无法读取图片文件。'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(Error('图片格式无法识别。'));
      image.onload = () => {
        const maxSide = props.maxSide;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return reject(Error('浏览器无法处理图片。'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', props.quality));
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function readFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    errorText.value = '请选择图片文件。';
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    errorText.value = '图片不能超过 12MB。';
    return;
  }
  try {
    draftValue.value = await compressImage(file);
    resetCrop();
    errorText.value = '';
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  }
}

function confirm(): void {
  const value = draftValue.value.trim();
  if (!isAllowedImageSource(value)) {
    errorText.value = '请输入酒馆内部头像地址、http/https 图片地址，或从本地选择图片。';
    return;
  }
  opened.value = false;
  previousFocus?.focus();
  emit('confirm', {
    avatar: value,
    zoom: draftZoom.value,
    offsetX: draftOffsetX.value,
    offsetY: draftOffsetY.value,
  });
}

function resetToCard(): void {
  opened.value = false;
  previousFocus?.focus();
  emit('reset');
}

watch(panLimit, limit => {
  draftOffsetX.value = _.clamp(draftOffsetX.value, -limit, limit);
  draftOffsetY.value = _.clamp(draftOffsetY.value, -limit, limit);
});

watch(
  () => [props.inline, props.modelValue, props.fallback],
  () => {
    imageFailed.value = false;
    if (props.inline) openEditor();
  },
  { immediate: true },
);
</script>
