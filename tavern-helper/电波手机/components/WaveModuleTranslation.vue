<template>
  <details
    v-if="prefs.autoTranslate && (translation?.content || translation?.title)"
    class="module-translation"
    :open="prefs.autoTranslate && prefs.expandTranslation"
  >
    <summary>译文 · {{ translation.language }}</summary>
    <strong v-if="translation.title">{{ translation.title }}</strong>
    <p>{{ translation.content }}</p>
  </details>
</template>
<script setup lang="ts">
import { ChatPreferencesSchema } from '../services/chat-preferences';
import { resolveBilingual } from '../services/module-settings';
import { computed } from 'vue';
import { usePhoneStore } from '../stores/phone';
const props = defineProps<{
  app: 'memo' | 'zone' | 'browse' | 'moments';
  translation?: { language: string; title: string; content: string };
}>();
const phone = usePhoneStore();
const prefs = computed(() =>
  resolveBilingual(
    props.app === 'moments' ? phone.state.moments.settings : phone.settings.moduleSettings[props.app],
    ChatPreferencesSchema.parse(phone.state.chatPreferences[phone.state.activeCharKey]),
  ),
);
</script>
<style scoped>
.module-translation {
  margin-block: 12px;
  padding-top: 10px;
  border-top: 1px solid #dce2eb;
  color: #63718a;
  font-size: 0.9em;
}
.module-translation summary {
  cursor: pointer;
  padding-block: 4px;
  color: #5e80be;
}
.module-translation p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
  margin: 8px 0 0;
}
.module-translation strong {
  display: block;
  margin-top: 8px;
}
</style>
