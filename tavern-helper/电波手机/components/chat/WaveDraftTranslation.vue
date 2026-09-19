<template>
  <div v-if="preferences.outgoingTranslation && text && !disabled" class="draft-translation" aria-live="polite">
    <span>发送为 · {{ target }}</span>
    <p>{{ busy ? '正在翻译…' : error || result?.text || '等待输入停顿…' }}</p>
    <small v-if="result">{{ result.provider }} · 角色将收到以上译文</small>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { ChatPreferencesSchema } from '../../services/chat/chat-preferences';
import { translateText, type TranslationResult } from '../../services/generation/translation';
const props = defineProps<{ disabled: boolean }>();
const phone = usePhoneStore();
const preferences = computed(() => ChatPreferencesSchema.parse(phone.state.chatPreferences[phone.state.activeCharKey]));
const target = computed(() => preferences.value.outgoingLanguage || preferences.value.sourceLanguage);
const text = computed(() => phone.activeThread?.draft.trim() || '');
const result = ref<TranslationResult | null>(null),
  busy = ref(false),
  error = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let request: AbortController | undefined;
watch(
  () => [
    text.value,
    target.value,
    preferences.value.inputLanguage,
    preferences.value.outgoingTranslation,
    phone.state.activeCharKey,
    phone.state.chatKey,
    JSON.stringify(phone.settings.translation),
    JSON.stringify(phone.settings.api),
    props.disabled,
  ],
  () => {
    clearTimeout(timer);
    request?.abort();
    result.value = null;
    error.value = '';
    busy.value = false;
    if (!text.value || !preferences.value.outgoingTranslation || props.disabled) return;
    const controller = new AbortController();
    request = controller;
    const input = text.value,
      settings = klona(phone.settings),
      source = preferences.value.inputLanguage,
      destination = target.value;
    timer = setTimeout(async () => {
      busy.value = true;
      try {
        const value = await translateText(settings, input, source, destination, controller.signal);
        if (!controller.signal.aborted) result.value = value;
      } catch (e) {
        if (!controller.signal.aborted) error.value = e instanceof Error ? e.message : '翻译失败';
      } finally {
        if (request === controller) busy.value = false;
      }
    }, 600);
  },
  { immediate: true },
);
onUnmounted(() => {
  clearTimeout(timer);
  request?.abort();
});
function currentResult() {
  if (!result.value || busy.value || error.value || !text.value) return null;
  return {
    sourceText: text.value,
    targetLanguage: target.value,
    text: result.value.text,
    provider: result.value.provider,
  };
}
defineExpose({ currentResult });
</script>
