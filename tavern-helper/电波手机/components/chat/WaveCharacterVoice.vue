<template>
  <section class="voice-service-card character-voice-settings">
    <div class="wave-settings-title">角色语音</div>
    <div class="character-voice-library">
      <label
        ><span>已保存音色</span
        ><WaveSelect
          :model-value="selectedVoice?.id || ''"
          :options="
            voice.savedVoices.map(item => ({
              value: item.id,
              label: `${item.note || item.voiceId} · ${providerNames[item.provider]}`,
            }))
          "
          placeholder="选择已保存的音色"
          @update:model-value="selectVoice"
      /></label>
      <p class="voice-library-help">音色按角色保存，切换时同时切换语音服务。</p>
    </div>
    <label
      ><span>启用哪个语音配置</span
      ><WaveSelect
        :model-value="voice.provider"
        :options="[
          { value: 'off', label: '关闭语音合成' },
          { value: 'minimax', label: 'MiniMax' },
          { value: 'elevenlabs', label: 'ElevenLabs' },
          { value: 'fish', label: 'Fish 鱼声' },
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
      <div class="character-voice-library">
        <label
          ><span>音色备注</span><input v-model="note" placeholder="例如：日常、轻声、少年声" maxlength="100"
        /></label>
        <div class="voice-library-actions">
          <button type="button" :disabled="!voice.voiceId.trim()" @click="saveVoice">
            {{ selectedVoice ? '保存备注' : '保存当前音色' }}
          </button>
          <button v-if="selectedVoice" type="button" @click="removeVoice">移出音色列表</button>
        </div>
        <p v-if="status" role="status" class="voice-library-help">{{ status }}</p>
      </div>
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
      <template v-else-if="voice.provider === 'elevenlabs'"
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
      <WaveMediaRange
        :model-value="voice.generation"
        :fallback="phone.settings.voiceServices.generation"
        noun="语音"
        unit="条"
        override
        @update:model-value="value => update({ generation: value })"
      />
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { CharacterVoiceSchema, type CharacterVoice } from '../../services/chat/speech';
import WaveMediaRange from '../shared/WaveMediaRange.vue';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveSlider from '../shared/WaveSlider.vue';
const phone = usePhoneStore();
const voice = computed(() => CharacterVoiceSchema.parse(phone.state.characterVoices[phone.state.activeCharKey]));
const providerNames = { minimax: 'MiniMax', elevenlabs: 'ElevenLabs', fish: 'Fish 鱼声' };
const selectedVoice = computed(() =>
  voice.value.savedVoices.find(
    item => item.provider === voice.value.provider && item.voiceId === voice.value.voiceId.trim(),
  ),
);
const note = ref(''),
  status = ref('');
watch(
  () => [phone.state.activeCharKey, selectedVoice.value?.id, selectedVoice.value?.note],
  () => {
    note.value = selectedVoice.value?.note || '';
    status.value = '';
  },
  { immediate: true },
);
function selectVoice(id: string) {
  const saved = voice.value.savedVoices.find(item => item.id === id);
  if (saved) update({ provider: saved.provider, voiceId: saved.voiceId });
}
function saveVoice() {
  if (voice.value.provider === 'off' || !voice.value.voiceId.trim()) return;
  const entry = {
    id: selectedVoice.value?.id || crypto.randomUUID(),
    provider: voice.value.provider,
    voiceId: voice.value.voiceId.trim(),
    note: note.value.trim(),
  };
  update({ savedVoices: [...voice.value.savedVoices.filter(item => item.id !== entry.id), entry] });
  status.value = '音色已保存';
}
function removeVoice() {
  update({ savedVoices: voice.value.savedVoices.filter(item => item.id !== selectedVoice.value?.id) });
  status.value = '已移出列表，当前使用的 Voice ID 保留';
}
function update(patch: Partial<CharacterVoice>) {
  const next = { ...voice.value, ...patch };
  if (next.provider === 'elevenlabs') next.speed = Math.max(0.7, Math.min(1.2, next.speed));
  phone.setCharacterVoice(next);
}
</script>
<style scoped lang="scss">
#wave-phone-script-root .character-voice-library {
  display: grid;
  gap: 12px;
  min-width: 0;
  label {
    display: grid;
    gap: 10px;
    font-weight: 400;
  }
  input {
    font-weight: 400;
  }
  .voice-library-help {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    font-weight: 400;
    opacity: 0.65;
  }
  .voice-library-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  button {
    appearance: none;
    width: auto;
    height: auto;
    margin: 0;
    padding: 9px 12px;
    border: 1px solid #8883;
    border-radius: 12px;
    background: #8881;
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-weight: 400;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
</style>
