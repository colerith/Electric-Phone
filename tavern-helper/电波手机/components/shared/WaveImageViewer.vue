<template>
  <Teleport v-if="surface" :to="surface">
    <div class="wave-gallery-backdrop" @keydown.esc.stop.prevent="escape">
      <section
        ref="dialog"
        class="wave-gallery"
        role="dialog"
        aria-modal="true"
        aria-label="图片查看器"
        tabindex="-1"
        @keydown.tab="trap"
      >
        <div class="gallery-stage" :class="{ zoomed }" :inert="panel ? true : undefined" @dblclick="zoomed = !zoomed">
          <div class="gallery-canvas">
            <img v-if="version" :src="version.url" :alt="draft?.description || '图片预览'" draggable="false" />
            <div v-else class="gallery-empty">
              <i class="fa-regular fa-image" aria-hidden="true"></i>
              <p>{{ draft?.description || '暂无图片' }}</p>
              <small>{{ draft ? '点击右上角生成按钮，创建这张图片。' : '原消息或动态已删除。' }}</small>
            </div>
          </div>
        </div>
        <div class="gallery-toolbar" role="toolbar" aria-label="图片操作" :inert="panel ? true : undefined">
          <button
            type="button"
            :disabled="!version"
            :aria-label="zoomed ? '适应窗口' : '放大查看'"
            :title="zoomed ? '适应窗口' : '放大查看'"
            @click="zoomed = !zoomed"
          >
            <i :class="zoomed ? 'fa-solid fa-compress' : 'fa-solid fa-expand'" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            :disabled="!draft || busy"
            aria-label="重新生成图片"
            title="重新生成图片"
            @click="openPanel('generate')"
          >
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
          </button>
          <button type="button" :disabled="!version" aria-label="保存图片" title="保存图片" @click="download">
            <i class="fa-solid fa-download" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            :disabled="!version || busy"
            aria-label="删除此版"
            title="删除此版"
            @click="openPanel('delete')"
          >
            <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            :disabled="!draft || busy"
            aria-label="编辑提示词"
            title="编辑提示词"
            @click="openPanel('prompt')"
          >
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            :disabled="!draft || busy"
            aria-label="编辑配文"
            title="编辑配文"
            @click="openPanel('caption')"
          >
            <i class="fa-solid fa-align-left" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            :disabled="!draft || busy"
            aria-label="生成记录"
            title="生成记录"
            @click="openPanel('versions')"
          >
            <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
          </button>
          <button type="button" aria-label="关闭大图" title="关闭大图" @click="emit('close')">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div v-if="targets.length > 1" class="gallery-page-arrows" :inert="panel ? true : undefined">
          <button
            type="button"
            :disabled="index === 0 || busy"
            aria-label="上一张"
            title="上一张"
            @click="navigate(-1)"
          >
            <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            :disabled="index === targets.length - 1 || busy"
            aria-label="下一张"
            title="下一张"
            @click="navigate(1)"
          >
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
        <footer class="gallery-caption" :inert="panel ? true : undefined">
          <p v-if="draft?.description">{{ draft.description }}</p>
          <div>
            <span v-if="targets.length > 1">{{ index + 1 }} / {{ targets.length }}</span
            ><button
              v-if="draft && draft.versions.length > 1"
              type="button"
              :disabled="busy"
              aria-label="查看历史版本"
              @click="openPanel('versions')"
            >
              <i class="fa-solid fa-layer-group" aria-hidden="true"></i> {{ versionIndex + 1 }} /
              {{ draft.versions.length }}
            </button>
          </div>
        </footer>
        <div v-if="status && !panel" class="gallery-toast" role="status" aria-live="polite">
          <i v-if="busy" class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><span>{{ status }}</span
          ><button v-if="busy" type="button" @click="cancel">
            <i class="fa-solid fa-stop" aria-hidden="true"></i> 停止
          </button>
        </div>
        <div v-if="panel && draft" class="gallery-sheet-backdrop" @click.self="closePanel()">
          <section
            ref="panelDialog"
            class="gallery-sheet"
            role="dialog"
            aria-modal="true"
            :aria-label="panelTitle"
            tabindex="-1"
          >
            <header>
              <span>{{ panelTitle }}</span
              ><button type="button" class="sheet-close" aria-label="返回大图" @click="closePanel()">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </header>
            <template v-if="panel === 'prompt'">
              <label
                >生图接口<WaveSelect
                  v-model="draft.profileId"
                  :disabled="busy"
                  :options="phone.settings.imageServices.profiles.map(p => ({ value: p.id, label: p.name }))"
              /></label>
              <label>画面主体<WaveSelect v-model="draft.subject" :disabled="busy" :options="subjects" /></label>
              <label>画面提示词<textarea v-model="draft.prompt" rows="5" maxlength="12000" :disabled="busy" /></label>
              <p class="gallery-hint">
                NovelAI 使用英文标签，GPT Image 使用自然语言。场景与物品不附加人物外貌。重生成会保留旧版本。
              </p>
              <div class="gallery-actions">
                <button
                  type="button"
                  :disabled="busy"
                  @click="
                    save();
                    closePanel(false);
                  "
                >
                  <i class="fa-regular fa-floppy-disk" aria-hidden="true"></i> 保存修改</button
                ><button type="button" class="primary" :disabled="busy || !draft.profileId" @click="run('generate')">
                  <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> 生成图片
                </button>
              </div>
            </template>
            <template v-else-if="panel === 'caption'">
              <label>图片配文<textarea v-model="draft.description" rows="4" maxlength="1000" :disabled="busy" /></label>
              <p class="gallery-hint">AI 配文使用副 API，根据画面提示词与已有说明生成，可继续修改。</p>
              <div class="gallery-actions">
                <button type="button" :disabled="busy" @click="run('caption')">
                  <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> AI 生成配文</button
                ><button
                  type="button"
                  class="primary"
                  :disabled="busy"
                  @click="
                    save();
                    closePanel(false);
                  "
                >
                  <i class="fa-regular fa-floppy-disk" aria-hidden="true"></i> 保存修改
                </button>
              </div>
            </template>
            <template v-else-if="panel === 'generate'">
              <p class="gallery-hint">
                {{
                  version ? '使用当前提示词重新生成，原图将保留在生成记录中。' : '使用当前提示词生成图片。'
                }}生成将调用所选生图接口。
              </p>
              <label
                >生图接口<WaveSelect
                  v-model="draft.profileId"
                  :options="phone.settings.imageServices.profiles.map(p => ({ value: p.id, label: p.name }))"
              /></label>
              <p class="gallery-prompt-preview">{{ draft.prompt || '尚未填写画面提示词，请先编辑。' }}</p>
              <div class="gallery-actions">
                <button type="button" @click="openPanel('prompt')">
                  <i class="fa-solid fa-pen" aria-hidden="true"></i> 编辑提示词</button
                ><button
                  type="button"
                  class="primary"
                  :disabled="busy || !draft.profileId || !draft.prompt.trim()"
                  @click="run('generate')"
                >
                  <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> 确认生成
                </button>
              </div>
            </template>
            <template v-else-if="panel === 'versions'">
              <div v-if="draft.versions.length" class="gallery-version-grid">
                <button
                  v-for="(item, i) in draft.versions"
                  :key="item.id"
                  type="button"
                  :aria-pressed="item.id === version?.id"
                  :aria-label="`使用第 ${i + 1} 版`"
                  @click="
                    selectVersion(i - versionIndex);
                    closePanel(false);
                  "
                >
                  <img :src="item.url" :alt="`第 ${i + 1} 版`" /><span
                    ><i v-if="item.id === version?.id" class="fa-solid fa-check" aria-hidden="true"></i> 第
                    {{ i + 1 }} 版</span
                  >
                </button>
              </div>
              <p v-else class="gallery-hint">还没有生成记录。</p>
            </template>
            <template v-else-if="panel === 'delete'">
              <p class="gallery-hint">确定删除当前图片版本？其他版本、原消息和文字说明会保留。</p>
              <div class="gallery-actions">
                <button type="button" @click="closePanel()">
                  <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> 取消</button
                ><button type="button" class="danger" @click="removeVersion">
                  <i class="fa-regular fa-trash-can" aria-hidden="true"></i> 确认删除
                </button>
              </div>
            </template>
            <p v-if="status" class="gallery-hint" role="status" aria-live="polite">
              <i v-if="busy" class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> {{ status }}
            </p>
            <button v-if="busy" type="button" @click="cancel">
              <i class="fa-solid fa-stop" aria-hidden="true"></i> 停止
            </button>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { phoneSurfaceKey } from '../../services/core/ui-context';
import { selectedImage, type ImageAsset, type ImageTarget } from '../../services/image/library';
import WaveSelect from './WaveSelect.vue';
const props = withDefaults(defineProps<{ targets: ImageTarget[]; initialIndex?: number }>(), { initialIndex: 0 });
const emit = defineEmits<{ close: [] }>();
const phone = usePhoneStore(),
  surface = inject(phoneSurfaceKey, ref(null));
const index = ref(props.initialIndex),
  draft = ref<ImageAsset>(),
  status = ref(''),
  busy = ref(false),
  zoomed = ref(false),
  panel = ref<'prompt' | 'caption' | 'versions' | 'delete' | 'generate' | null>(null),
  panelDialog = ref<HTMLElement>(),
  dialog = ref<HTMLElement>();
const target = computed(() => props.targets[index.value]),
  version = computed(() => draft.value && selectedImage(draft.value));
const versionIndex = computed(() => draft.value?.versions.findIndex(v => v.id === version.value?.id) ?? -1);
const subjects = [
  { value: 'character', label: '发图角色' },
  { value: 'user', label: '我（用户）' },
  { value: 'other_character', label: '其他人物 / 多人' },
  { value: 'scene', label: '场景 / 风景（无人）' },
  { value: 'object', label: '物品（无人）' },
];

const panelTitle = computed(
  () =>
    ({
      prompt: '编辑画面提示词',
      caption: '编辑图片配文',
      versions: '生成记录',
      delete: '删除当前版本',
      generate: version.value ? '重新生成图片' : '生成图片',
    })[panel.value || 'prompt'],
);
let panelTrigger: HTMLElement | null = null;
function openPanel(value: NonNullable<typeof panel.value>) {
  panelTrigger = document.activeElement as HTMLElement;
  panel.value = value;
  void nextTick(() => panelDialog.value?.focus());
}
function closePanel(discard = true) {
  if (discard && !busy.value) draft.value = klona(phone.getImageAsset(target.value));
  panel.value = null;
  void nextTick(() => panelTrigger?.focus());
}
function escape() {
  if (panel.value) closePanel();
  else emit('close');
}
function download() {
  const url = version.value?.url;
  if (!url || !/^(https?:\/\/|data:image\/|\/)/i.test(url)) return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `wave-image-${Date.now()}.png`;
  anchor.rel = 'noopener';
  anchor.target = '_blank';
  anchor.click();
}

let controller: AbortController | undefined,
  token = 0;
const previousFocus = document.activeElement as HTMLElement | null;
function load() {
  draft.value = klona(phone.getImageAsset(target.value));
  status.value = draft.value?.error || '';
  zoomed.value = false;
}
watch(target, load, { immediate: true });
watch(
  () => `${phone.context?.cardKey}::${phone.context?.chatKey}`,
  () => emit('close'),
);
onMounted(() => void nextTick(() => dialog.value?.focus()));
onBeforeUnmount(() => {
  cancel();
  previousFocus?.focus();
});
function trap(event: KeyboardEvent) {
  const elements = Array.from(
    (panel.value ? panelDialog.value : dialog.value)?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
    ) || [],
  ).filter(e => e.getClientRects().length);
  const first = elements[0],
    last = elements.at(-1);
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === (panel.value ? panelDialog.value : dialog.value))
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
function navigate(delta: number) {
  save();
  index.value += delta;
}
function save() {
  if (draft.value) {
    const version = selectedImage(draft.value);
    if (version) {
      version.prompt = draft.value.prompt;
      version.description = draft.value.description;
    }
    phone.updateImageAsset(target.value, draft.value);
    status.value = '已保存';
  }
}
function selectVersion(delta: number) {
  if (!draft.value) return;
  const item = draft.value.versions[versionIndex.value + delta];
  if (item) {
    draft.value.selected = item.id;
    draft.value.prompt = item.prompt;
    draft.value.description = item.description;

    save();
  }
}
function removeVersion() {
  if (!draft.value || !version.value) return;
  draft.value.versions = draft.value.versions.filter(v => v.id !== version.value?.id);
  draft.value.selected = draft.value.versions.at(-1)?.id || '';
  const remaining = selectedImage(draft.value);
  if (remaining) {
    draft.value.prompt = remaining.prompt;
    draft.value.description = remaining.description;
  }

  save();
  closePanel(false);
}
function cancel() {
  token++;
  controller?.abort();
  busy.value = false;
  status.value = '已停止，原图保留';
}
async function run(action: 'generate' | 'caption') {
  if (!draft.value || busy.value) return;
  const current = ++token;
  controller = new AbortController();
  busy.value = true;
  if (action === 'generate') closePanel(false);
  const timer = setTimeout(() => cancel(), 240000);
  status.value = action === 'generate' ? '正在生成图片，旧版本已保留…' : '副 API 正在生成配文…';
  try {
    await phone.runImageAction(target.value, klona(draft.value), action, controller.signal);
    if (current === token) {
      load();
      status.value = '已完成并保存';
    }
  } catch (e) {
    if (current === token) status.value = e instanceof Error ? e.message : '请求失败，原图保留';
  } finally {
    clearTimeout(timer);
    if (current === token) busy.value = false;
  }
}
</script>
<style scoped lang="scss">
#wave-phone-script-root .wave-gallery-backdrop {
  position: absolute;
  inset: 0;
  z-index: 450;
  box-sizing: border-box;
  overflow: hidden;
  background: #101216;
}
#wave-phone-script-root .wave-gallery {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
  background: #101216;
  font: 13px/1.6 var(--wave-ui-font, sans-serif);
  button {
    appearance: none;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: 0;
    margin: 0;
    padding: 10px 13px;
    border: 0;
    border-radius: 13px;
    background: #ffffff18;
    color: inherit;
    font: inherit;
    font-weight: 400;
    cursor: pointer;
    box-shadow: none;
    text-shadow: none;
    transition:
      transform 0.16s,
      background 0.16s;
  }
  button:hover {
    background: #ffffff30;
  }
  button:active {
    transform: scale(0.94);
  }
  button:focus-visible {
    outline: 2px solid #9ec2ff;
    outline-offset: 3px;
  }
  button:disabled {
    opacity: 0.32;
    cursor: default;
  }
  .gallery-stage {
    position: absolute;
    inset: 0;
    overflow: auto;
    overscroll-behavior: contain;
    touch-action: pan-x pan-y pinch-zoom;
    scrollbar-width: none;
  }
  .gallery-stage::-webkit-scrollbar {
    display: none;
  }
  .gallery-canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  .gallery-canvas > img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
  }
  .zoomed .gallery-canvas {
    display: block;
    width: 180%;
    height: auto;
    min-height: 100%;
  }
  .zoomed .gallery-canvas > img {
    height: auto;
    max-height: none;
  }
  .gallery-toolbar {
    position: absolute;
    top: max(12px, env(safe-area-inset-top));
    right: 10px;
    left: 10px;
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    pointer-events: none;
    z-index: 2;
  }
  .gallery-toolbar button,
  .gallery-page-arrows button {
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    background: #141711b3;
    color: #fff;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    pointer-events: auto;
  }
  .gallery-toolbar button:hover,
  .gallery-page-arrows button:hover {
    background: #141711e6;
  }
  .gallery-page-arrows {
    position: absolute;
    inset: 50% 12px auto;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
    transform: translateY(-50%);
  }
  .gallery-caption {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 48px 18px max(18px, env(safe-area-inset-bottom));
    background: linear-gradient(transparent, #0009);
    pointer-events: none;
  }
  .gallery-caption p {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
    padding: 0;
    text-indent: 0;
    font-size: 12px;
    line-height: 1.6;
    color: #ffffffe6;
  }
  .gallery-caption > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    font-size: 11px;
    color: #fffc;
  }
  .gallery-caption button {
    padding: 4px 9px;
    font-size: 11px;
    pointer-events: auto;
  }
  .gallery-empty {
    max-width: 75%;
    text-align: center;
    color: #c4cad4;
  }
  .gallery-empty > i {
    font-size: 42px;
    opacity: 0.45;
  }
  .gallery-empty p {
    margin: 20px 0 8px;
    text-indent: 0;
  }
  .gallery-empty small {
    opacity: 0.6;
  }
  .gallery-toast {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 110px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: #101216d9;
    backdrop-filter: blur(10px);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .gallery-toast span {
    flex: 1;
    min-width: 0;
  }
  .gallery-sheet-backdrop {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    background: #0005;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
  }
  .gallery-sheet {
    display: grid;
    gap: 18px;
    box-sizing: border-box;
    width: 100%;
    max-height: 100%;
    padding: 20px;
    border-radius: 22px;
    background: var(--wave-card, #fff);
    color: var(--wave-ink, #374558);
    overflow: auto;
    overscroll-behavior: contain;
    box-shadow: 0 12px 48px #0004;
  }
  .gallery-sheet header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font: 500 16px/1.5 var(--wave-ui-font, sans-serif);
    margin: 0;
    padding: 0;
  }
  .gallery-sheet button {
    border: 1px solid #8882;
    background: #8881;
  }
  .gallery-sheet .sheet-close {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
  }
  .gallery-sheet button.primary {
    background: var(--wave-blue, #5e80be);
    color: #fff;
    border-color: transparent;
  }
  .gallery-sheet button.danger {
    background: #ba5970;
    color: #fff;
    border-color: transparent;
  }
  .gallery-sheet label {
    display: grid;
    gap: 9px;
    margin: 0;
    min-width: 0;
    font-weight: 400;
  }
  .gallery-sheet textarea {
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 12px;
    border: 1px solid #8883;
    border-radius: 13px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 400;
    resize: vertical;
  }
  .gallery-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .gallery-actions > button {
    flex: 1;
  }
  .gallery-hint {
    margin: 0;
    padding: 0;
    text-indent: 0;
    font-size: 12px;
    opacity: 0.7;
    overflow-wrap: anywhere;
  }
  .gallery-prompt-preview {
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    background: #8881;
    font-size: 12px;
    max-height: 140px;
    overflow: auto;
    text-indent: 0;
    overflow-wrap: anywhere;
  }
  .gallery-version-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .gallery-version-grid button {
    display: grid;
    gap: 8px;
    padding: 6px;
    overflow: hidden;
    border: 2px solid transparent;
  }
  .gallery-version-grid button[aria-pressed='true'] {
    border-color: var(--wave-blue, #5e80be);
  }
  .gallery-version-grid img {
    display: block;
    width: 100%;
    height: 110px;
    object-fit: cover;
    border-radius: 9px;
  }
  .gallery-version-grid span {
    font-size: 12px;
  }
  @media (max-width: 360px) {
    .gallery-toolbar {
      gap: 3px;
      left: 7px;
      right: 7px;
    }
    .gallery-toolbar button {
      width: 32px;
      height: 32px;
      flex-basis: 32px;
    }
    .gallery-sheet {
      padding: 16px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
    .fa-spin {
      animation: none;
    }
  }
}
</style>
