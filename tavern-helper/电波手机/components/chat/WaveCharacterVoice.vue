<template>
  <section class="voice-service-card character-voice-settings">
    <div class="wave-settings-title">角色语音</div>
    <label
      ><span>启用哪个语音配置</span
      ><WaveSelect
        :model-value="voice.provider"
        :options="[
          { value: 'off', label: '关闭语音合成' },
          { value: 'minimax', label: 'MiniMax' },
          { value: 'elevenlabs', label: 'ElevenLabs' },
        ]"
        @update:model-value="value => update({ provider: value as CharacterVoice['provider'] })"
    /></label>
    <template v-if="voice.provider !== 'off'"
      ><label
        ><span>Voice ID</span
        ><input
          :value="voice.voiceId"
          placeholder="当前角色的音色 ID"
          @input="update({ voiceId: ($event.target as HTMLInputElement).value })"
      /></label>
      <label
        ><span
          >语速 <b>{{ voice.speed.toFixed(2) }}×</b></span
        ><WaveSlider
          :model-value="voice.speed"
          :min="voice.provider === 'elevenlabs' ? 0.7 : 0.5"
          :max="voice.provider === 'elevenlabs' ? 1.2 : 2"
          :step="0.05"
          aria-label="语音速度"
          @update:model-value="value => update({ speed: value })"
      /></label>
      <label v-if="voice.provider === 'minimax'"
        ><span
          >语调 <b>{{ voice.pitch > 0 ? '+' : '' }}{{ voice.pitch }}</b></span
        ><WaveSlider
          :model-value="voice.pitch"
          :min="-12"
          :max="12"
          :step="1"
          aria-label="语调"
          @update:model-value="value => update({ pitch: value })"
      /></label>
      <template v-else
        ><label
          ><span
            >语调表现 <b>{{ Math.round(voice.style * 100) }}%</b></span
          ><WaveSlider
            :model-value="voice.style"
            :min="0"
            :max="1"
            :step="0.05"
            aria-label="语调表现"
            @update:model-value="value => update({ style: value })"
          /><small>ElevenLabs 使用风格强度调整表现，不支持直接设置音高。</small></label
        ><label
          ><span>声音稳定性</span
          ><WaveSlider
            :model-value="voice.stability"
            :min="0"
            :max="1"
            :step="0.05"
            aria-label="声音稳定性"
            @update:model-value="value => update({ stability: value })" /></label
      ></template>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { CharacterVoiceSchema, type CharacterVoice } from '../../services/chat/speech';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveSlider from '../shared/WaveSlider.vue';
const phone = usePhoneStore();
const voice = computed(() => CharacterVoiceSchema.parse(phone.state.characterVoices[phone.state.activeCharKey]));
function update(patch: Partial<CharacterVoice>) {
  const next = { ...voice.value, ...patch };
  if (next.provider === 'elevenlabs') next.speed = Math.max(0.7, Math.min(1.2, next.speed));
  phone.setCharacterVoice(next);
}
</script>
