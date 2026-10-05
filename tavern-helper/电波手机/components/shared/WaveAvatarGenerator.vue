<template>
  <div class="wave-avatar-generator">
    <header>
      <div>
        <small>AI AVATAR</small>
        <h3>生成{{ label }}</h3>
      </div>
      <button type="button" aria-label="返回头像编辑" @click="emit('close')">×</button>
    </header>
    <label
      >生图接口<WaveSelect
        v-model="profileId"
        :disabled="busy"
        :options="phone.settings.imageServices.profiles.map(p => ({ value: p.id, label: p.name }))"
        placeholder="选择生图配置"
    /></label>
    <p v-if="!profile">请先在「设置 → 图像生成」添加接口配置。</p>
    <label
      >补充提示词<textarea
        ref="promptInput"
        v-model="prompt"
        :disabled="busy"
        rows="7"
        maxlength="12000"
        placeholder="描述你想要的头像：主体、外貌、服装、风格、背景……可直接写中文，再使用 AI 润色。"
      />
    </label>
    <p>
      {{
        profile?.provider === 'novelai'
          ? 'AI 润色会整理为适合 NovelAI 的英文标签。'
          : 'AI 润色会整理为适合 GPT Image 的英文画面描述。'
      }}润色使用副 API，可继续编辑结果。
    </p>
    <div v-if="status" class="avatar-ai-status" role="status" aria-live="polite">
      <i v-if="busy" class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>{{ status }}
    </div>
    <div class="avatar-ai-actions">
      <button type="button" :disabled="busy || !profile || !prompt.trim()" @click="polish">
        <i class="fa-solid fa-wand-magic-sparkles"></i> AI 润色
      </button>
      <button type="button" class="avatar-ai-primary" :disabled="busy || !profile || !prompt.trim()" @click="generate">
        <i class="fa-regular fa-image"></i> 生成头像
      </button>
    </div>
    <p>生成后可预览、调整选区，再点击保存应用头像。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { createPhoneGenerationId, polishAvatarPrompt, stopPhoneGeneration } from '../../services/generation/generation';
import { generateImage } from '../../services/image/generate';
import { CharacterImageSchema } from '../../services/image/schema';
import WaveSelect from './WaveSelect.vue';
defineProps<{ label: string }>();
const emit = defineEmits<{ close: []; generated: [image: string] }>();
const phone = usePhoneStore();
const profileId = ref(phone.settings.imageServices.profiles[0]?.id || '');
const profile = computed(() => phone.settings.imageServices.profiles.find(p => p.id === profileId.value));
const prompt = ref(''),
  status = ref(''),
  busy = ref(false),
  promptInput = ref<HTMLTextAreaElement | null>(null);
let token = 0,
  requestId = '',
  controller: AbortController | undefined;
onMounted(() => void nextTick(() => promptInput.value?.focus()));
function cancel() {
  token++;
  controller?.abort();
  if (requestId) void stopPhoneGeneration(requestId).catch(() => {});
  requestId = '';
  busy.value = false;
}
onBeforeUnmount(cancel);
watch(
  () => `${phone.context?.cardKey}::${phone.context?.chatKey}::${phone.state.activeCharKey}`,
  () => {
    cancel();
    emit('close');
  },
);
async function run(kind: 'polish' | 'generate') {
  if (busy.value || !profile.value || !prompt.value.trim()) return;
  const runToken = ++token;
  const selected = klona(profile.value),
    text = prompt.value.trim(),
    settings = klona(phone.settings);
  busy.value = true;
  status.value = kind === 'polish' ? '副 API 正在润色提示词…' : '正在生成头像，请稍候…';
  try {
    if (kind === 'polish') {
      requestId = createPhoneGenerationId();
      const result = await polishAvatarPrompt(settings, text, selected.provider, requestId);
      if (runToken !== token) return;
      prompt.value = result;
      status.value = '已润色，可继续修改或生成头像。';
    } else {
      controller = new AbortController();
      const image = await generateImage(
        { ...selected, width: 1024, height: 1024, vibes: [] },
        CharacterImageSchema.parse({ enabled: true }),
        text,
        controller.signal,
      );
      if (runToken !== token) return;
      emit('generated', image);
    }
  } catch (error) {
    if (runToken === token) status.value = error instanceof Error ? error.message : '请求失败，请重试';
  } finally {
    if (runToken === token) {
      busy.value = false;
      requestId = '';
      controller = undefined;
    }
  }
}
function polish() {
  return run('polish');
}
function generate() {
  return run('generate');
}
</script>
<style scoped lang="scss">
#wave-phone-script-root .wave-avatar-generator {
  box-sizing: border-box;
  display: grid;
  gap: 18px;
  width: 100%;
  min-width: 0;
  padding: 22px;
  border-radius: 22px;
  background: var(--wave-card, #fff);
  color: var(--wave-ink, #374558);
  font: 13px/1.6 var(--wave-ui-font, sans-serif);
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  small {
    font-size: 10px;
    letter-spacing: 2px;
    color: var(--wave-blue, #5e80be);
  }
  h3 {
    margin: 3px 0 0;
    font-size: 18px;
    font-weight: 500;
  }
  label {
    display: grid;
    gap: 10px;
    margin: 0;
    font-weight: 400;
  }
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 12px;
    border: 1px solid #8883;
    border-radius: 12px;
    background: #8881;
    color: inherit;
    font: inherit;
    resize: vertical;
  }
  p {
    margin: 0;
    padding: 0;
    text-indent: 0;
    font-size: 12px;
    opacity: 0.65;
  }
  button:not(.wave-select-trigger):not([role='option']) {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: auto;
    height: auto;
    margin: 0;
    padding: 11px 12px;
    border: 1px solid #8882;
    border-radius: 13px;
    background: #8881;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  header > button {
    flex: 0 0 34px;
  }
  .avatar-ai-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  .avatar-ai-actions button.avatar-ai-primary {
    background: var(--wave-blue, #5e80be);
    color: white;
    border-color: transparent;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .avatar-ai-status {
    padding: 12px;
    border-radius: 12px;
    background: #5e80be10;
    color: var(--wave-blue, #5e80be);
    overflow-wrap: anywhere;
  }
  .avatar-ai-status i {
    margin-right: 8px;
  }
  @media (prefers-reduced-motion: reduce) {
    .fa-spin {
      animation: none;
    }
  }
}
</style>
