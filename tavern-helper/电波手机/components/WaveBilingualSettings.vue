<template>
  <section class="chat-settings-group system-settings-card wave-bilingual-settings">
    <div class="wave-settings-title">双语阅读</div>
    <label class="chat-setting-row"
      ><span>同步私聊双语设置<small>跟随当前聊天对象的语言、翻译开关与展开方式</small></span
      ><WaveToggle
        :model-value="prefs.syncChat"
        aria-label="同步私聊双语设置"
        @update:model-value="update('syncChat', $event)"
    /></label>
    <p v-if="prefs.syncChat" class="chat-settings-note">
      {{
        current.autoTranslate ? `${current.sourceLanguage} → ${current.targetLanguage}` : '私聊未开启自动翻译'
      }}。修改私聊设置后自动生效，无需重复设置。
    </p>
    <template v-else>
      <label class="chat-setting-row"
        ><span>自动附带译文</span
        ><WaveToggle
          :model-value="prefs.autoTranslate"
          aria-label="应用自动翻译"
          @update:model-value="update('autoTranslate', $event)"
      /></label>
      <template v-if="prefs.autoTranslate">
        <label class="chat-setting-row"
          ><span>自动展开译文</span
          ><WaveToggle
            :model-value="prefs.expandTranslation"
            aria-label="应用自动展开译文"
            @update:model-value="update('expandTranslation', $event)"
        /></label>
        <label class="chat-setting-row"
          ><span>原文语言</span
          ><WaveSelect
            :model-value="prefs.sourceLanguage"
            :options="translationLanguages"
            aria-label="应用原文语言"
            @update:model-value="update('sourceLanguage', $event)"
        /></label>
        <label class="chat-setting-row"
          ><span>译文语言</span
          ><WaveSelect
            :model-value="prefs.targetLanguage"
            :options="translationLanguages"
            aria-label="应用译文语言"
            @update:model-value="update('targetLanguage', $event)"
        /></label> </template
    ></template>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ChatPreferencesSchema } from '../services/chat-preferences';
import { translationLanguages } from '../services/translation';
import { usePhoneStore } from '../stores/phone';
import WaveToggle from './WaveToggle.vue';
import WaveSelect from './WaveSelect.vue';
const props = defineProps<{
  prefs: {
    syncChat: boolean;
    autoTranslate: boolean;
    expandTranslation: boolean;
    sourceLanguage: string;
    targetLanguage: string;
  };
}>();
const emit = defineEmits<{ save: []; update: [patch: Partial<typeof props.prefs>] }>();
function update<K extends keyof typeof props.prefs>(key: K, value: (typeof props.prefs)[K]) {
  emit('update', { [key]: value });
  emit('save');
}
const phone = usePhoneStore();
const current = computed(() => ChatPreferencesSchema.parse(phone.state.chatPreferences[phone.state.activeCharKey]));
</script>
