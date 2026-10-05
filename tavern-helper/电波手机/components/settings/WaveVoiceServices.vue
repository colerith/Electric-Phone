<template>
  <div class="voice-service-settings">
    <div class="wave-settings-title">语音服务</div>
    <section v-for="provider in ['minimax', 'elevenlabs', 'fish'] as const" :key="provider" class="voice-service-card">
      <div class="toggle-row">
        <span
          ><strong>{{ provider === 'minimax' ? 'MiniMax' : provider === 'fish' ? 'Fish 鱼声' : 'ElevenLabs' }}</strong
          ><small>{{ provider === 'minimax' ? '国内 / 海外语音合成' : '多语言语音合成' }}</small></span
        ><WaveToggle v-model="phone.settings.voiceServices[provider].enabled" :aria-label="`启用 ${provider}`" />
      </div>
      <template v-if="phone.settings.voiceServices[provider].enabled">
        <label v-if="provider === 'minimax'"
          ><strong>服务区域</strong
          ><WaveSelect
            v-model="phone.settings.voiceServices.minimax.region"
            :options="[
              { value: 'cn', label: '国内' },
              { value: 'global', label: '海外' },
            ]"
          /><small>区域应与密钥所属平台一致。</small></label
        >
        <label v-if="provider === 'minimax'"
          ><strong>Group ID（可选）</strong
          ><input
            v-model.trim="phone.settings.voiceServices.minimax.groupId"
            autocomplete="off"
            placeholder="账户 Group ID"
        /></label>
        <label
          ><strong>API 密钥</strong
          ><input
            v-model.trim="phone.settings.voiceServices[provider].apiKey"
            type="password"
            autocomplete="new-password"
            placeholder="输入 API Key"
        /></label>
        <label
          ><strong>语音模型</strong
          ><WaveSelect
            v-model="phone.settings.voiceServices[provider].model"
            :options="provider === 'minimax' ? miniModels : provider === 'fish' ? fishModels : elevenModels"
        /></label>
        <template v-if="provider === 'fish'">
          <button class="wave-service-action" type="button" :disabled="loadingFish" @click="refreshFish">
            {{ loadingFish ? '读取中…' : '拉取官方模型列表' }}
          </button>
          <small role="status">{{ fishStatus }}</small>
          <label
            ><strong>模型 ID（可手动填写）</strong><input v-model.trim="phone.settings.voiceServices.fish.model"
          /></label>
        </template>
        <label
          ><strong>自定义 API URL（代理）</strong
          ><input
            v-model.trim="phone.settings.voiceServices[provider].baseUrl"
            type="url"
            placeholder="留空使用官方服务"
          /><small>填写服务根地址，自动补全合成路径。</small></label
        >
      </template>
    </section>
    <p class="voice-help">保存后，在聊天设置中为当前角色选择服务与 Voice ID。点击语音消息时才进行合成。</p>
  </div>
</template>
<script setup lang="ts">
import { usePhoneStore } from '../../stores/phone';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveSelect from '../shared/WaveSelect.vue';
import { ref, onMounted } from 'vue';
import { FISH_MODELS, fetchFishModels } from '../../services/chat/speech';
const phone = usePhoneStore();
const fishOptions = (ids: string[]) =>
  ids.map(value => ({ value, label: value === 'drama-3-preview' ? 'Drama 3（Preview）' : value }));
const fishModels = ref(fishOptions(FISH_MODELS));
const loadingFish = ref(false);
const fishStatus = ref('');
async function refreshFish() {
  loadingFish.value = true;
  try {
    fishModels.value = fishOptions(await fetchFishModels());
    fishStatus.value = '已读取官方列表，并补齐内置模型';
  } catch {
    fishStatus.value = '官方列表暂不可用，使用内置模型；可手动填写模型 ID';
  } finally {
    loadingFish.value = false;
  }
}
onMounted(() => {
  void refreshFish();
});
const miniModels = [
  { value: 'speech-2.8-hd', label: 'Speech 2.8 HD' },
  { value: 'speech-2.8-turbo', label: 'Speech 2.8 Turbo' },
  { value: 'speech-02-hd', label: 'Speech 02 HD' },
  { value: 'speech-02-turbo', label: 'Speech 02 Turbo' },
  { value: 'speech-2.6-hd', label: 'Speech 2.6 HD' },
  { value: 'speech-2.6-turbo', label: 'Speech 2.6 Turbo' },
];
const elevenModels = [
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2' },
  { value: 'eleven_flash_v2_5', label: 'Flash v2.5' },
  { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
];
</script>
