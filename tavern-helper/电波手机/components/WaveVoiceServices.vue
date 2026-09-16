<template>
  <div class="voice-service-settings">
    <div class="wave-settings-title">语音服务</div>
    <section v-for="provider in ['minimax', 'elevenlabs'] as const" :key="provider" class="voice-service-card">
      <div class="toggle-row">
        <span
          ><strong>{{ provider === 'minimax' ? 'MiniMax' : 'ElevenLabs' }}</strong
          ><small>{{ provider === 'minimax' ? '国内 / 海外语音合成' : '多语言语音合成' }}</small></span
        ><WaveToggle v-model="phone.settings.voiceServices[provider].enabled" :aria-label="`启用 ${provider}`" />
      </div>
      <template v-if="phone.settings.voiceServices[provider].enabled">
        <label v-if="provider === 'minimax'"
          ><span>服务区域</span
          ><WaveSelect
            v-model="phone.settings.voiceServices.minimax.region"
            :options="[
              { value: 'cn', label: '国内' },
              { value: 'global', label: '海外' },
            ]"
          /><small>区域应与密钥所属平台一致。</small></label
        >
        <label v-if="provider === 'minimax'"
          ><span>Group ID（可选）</span
          ><input
            v-model.trim="phone.settings.voiceServices.minimax.groupId"
            autocomplete="off"
            placeholder="账户 Group ID"
        /></label>
        <label
          ><span>API 密钥</span
          ><input
            v-model.trim="phone.settings.voiceServices[provider].apiKey"
            type="password"
            autocomplete="new-password"
            placeholder="输入 API Key"
        /></label>
        <label
          ><span>语音模型</span
          ><WaveSelect
            v-model="phone.settings.voiceServices[provider].model"
            :options="provider === 'minimax' ? miniModels : elevenModels"
        /></label>
        <label
          ><span>自定义 API URL（代理）</span
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
import { usePhoneStore } from '../stores/phone';
import WaveToggle from './WaveToggle.vue';
import WaveSelect from './WaveSelect.vue';
const phone = usePhoneStore();
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
