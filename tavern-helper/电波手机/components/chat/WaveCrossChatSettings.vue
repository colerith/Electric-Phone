<template>
  <section class="chat-settings-group">
    <div class="wave-settings-title">跨聊天互动</div>
    <label class="chat-setting-row"
      ><span>{{ label }}<small>本会话回复完成后按概率触发，每位发言角色 1–3 条；不会连锁触发。</small></span
      ><WaveToggle
        :model-value="preferences.crossChatEnabled"
        :aria-label="label"
        @update:model-value="value => update({ crossChatEnabled: value })"
    /></label>
    <label v-if="preferences.crossChatEnabled" class="chat-setting-block"
      >触发概率 · {{ preferences.crossChatProbability }}%
      <WaveSlider
        :min="0"
        :max="100"
        :step="5"
        :model-value="preferences.crossChatProbability"
        aria-label="跨聊天互动触发概率"
        @update:model-value="value => update({ crossChatProbability: value })"
      />
    </label>
    <p class="chat-settings-note">
      {{
        group
          ? '从本轮发言成员中随机选择一位，向你发送私聊。'
          : '从你和该角色共同加入的群聊中随机选择一个，由该角色发言。'
      }}需启用副 API。
    </p>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveSlider from '../shared/WaveSlider.vue';
import { usePhoneStore } from '../../stores/phone';
import { ChatPreferencesSchema, type ChatPreferences } from '../../services/chat/chat-preferences';
const phone = usePhoneStore();
const group = computed(() => phone.activeIdentity?.source === 'local_group');
const label = computed(() => (group.value ? '群聊触发私聊' : '私聊触发群聊'));
const preferences = computed(() => ChatPreferencesSchema.parse(phone.state.chatPreferences[phone.state.activeCharKey]));
function update(patch: Partial<ChatPreferences>) {
  phone.setChatPreferences({ ...preferences.value, ...patch });
}
</script>
