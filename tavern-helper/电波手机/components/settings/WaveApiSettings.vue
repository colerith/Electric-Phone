<template>
  <section class="settings-card api-settings">
    <div class="wave-settings-title">连接配置</div>
    <label v-if="phone.settings.apiProfiles.length"
      ><strong>已保存的配置</strong
      ><WaveSelect
        :model-value="phone.settings.activeApiProfileId"
        :options="profileOptions"
        aria-label="切换 API 配置"
        @update:model-value="selectProfile"
    /></label>
    <label
      ><strong>配置名称</strong><input v-model.trim="profileName" maxlength="60" placeholder="例如：日常聊天 / 翻译"
    /></label>
    <div class="api-inline-actions">
      <button type="button" @click="saveAs">另存为新配置</button
      ><button v-if="phone.settings.activeApiProfileId" type="button" @click="removeProfile">删除此配置</button>
    </div>
    <div class="toggle-row">
      <span><strong>启用副 API</strong><small>独立生成手机回复</small></span
      ><WaveToggle v-model="phone.settings.api.enabled" aria-label="启用副 API" />
    </div>
    <label
      ><strong>服务类型</strong
      ><WaveSelect
        :model-value="phone.settings.api.provider"
        :options="providers"
        aria-label="服务类型"
        @update:model-value="changeProvider"
    /></label>
    <label
      ><strong>Endpoint / 代理地址</strong
      ><input v-model.trim="phone.settings.api.apiurl" type="url" placeholder="https://…" /><small
        v-if="phone.settings.api.provider === 'google_ai_studio'"
        >留空使用 Google 官方接口。</small
      ></label
    >
    <label
      ><strong>API Key / Token</strong><input v-model="phone.settings.api.key" type="password" autocomplete="off"
    /></label>
    <template v-if="phone.settings.api.provider === 'vertex_ai'"
      ><label><strong>Location</strong><input v-model.trim="phone.settings.api.vertexLocation" /></label
      ><label><strong>Project ID</strong><input v-model.trim="phone.settings.api.vertexProjectId" /></label
    ></template>
    <label
      ><strong>模型</strong>
      <div class="api-model-row">
        <input v-model.trim="phone.settings.api.model" placeholder="输入模型 ID 或从列表选择" /><button
          type="button"
          :disabled="loadingModels"
          @click="loadModels"
        >
          {{ loadingModels ? '拉取中…' : '拉取模型' }}
        </button>
      </div>
      <WaveSelect
        v-if="models.length"
        v-model="phone.settings.api.model"
        :options="models.map(value => ({ value, label: value }))"
        aria-label="可用模型列表"
      /><small v-if="modelError" role="status">{{ modelError }}</small></label
    >
    <div class="wave-settings-title">生成参数</div>
    <p v-if="samplingOff" class="api-note">已识别 Gemini 3.5–3.8 Flash，以下五项参数不会发送。</p>
    <div class="settings-columns api-parameters">
      <label v-for="field in samplingFields" :key="field.key"
        ><strong>{{ field.label }}</strong
        ><input
          v-model.number="phone.settings.api[field.key]"
          type="number"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :disabled="samplingOff"
      /></label>
    </div>
    <p class="api-note">Top K 为 0 时不发送。服务端不支持的参数可能被忽略或拒绝。</p>
    <div class="settings-columns">
      <label
        ><strong>上下文长度</strong
        ><input v-model.number="phone.settings.api.contextLength" type="number" min="2048" max="2000000" step="1024"
      /></label>
      <label
        ><strong>最大回复长度</strong
        ><input v-model.number="phone.settings.api.maxTokens" type="number" min="256" max="131072" step="256"
      /></label>
      <label
        ><strong>失败自动重试次数</strong
        ><input v-model.number="phone.settings.api.retryCount" type="number" min="0" max="5" step="1"
      /></label>
      <label
        ><strong>单次超时（毫秒）</strong
        ><input v-model.number="phone.settings.api.timeoutMs" type="number" min="10000" max="180000" step="1000"
      /></label>
    </div>
    <p class="api-note">
      长度单位为 tokens；上下文采用本地估算并为回复预留空间，超限优先移除最旧历史。0 次重试表示只请求一次。
    </p>
    <p class="api-note">密钥仅保存在脚本变量，不进入聊天提示词。</p>
    <p v-if="feedback" class="api-feedback" role="status">{{ feedback }}</p>
    <div class="settings-actions">
      <button type="button" :disabled="testing" @click="test">{{ testing ? '测试中…' : '测试连接' }}</button
      ><button class="primary-action" type="button" @click="save">保存 API 设置</button>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { ApiSettingsSchema, type Provider } from '../../schemas';
import { providerDefaults, omitSampling, fetchApiModels } from '../../services/core/api-config';
import { testSecondaryApi } from '../../services/generation/generation';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveToggle from '../shared/WaveToggle.vue';
const phone = usePhoneStore();
const models = ref<string[]>([]),
  modelError = ref(''),
  feedback = ref(''),
  profileName = ref('');
const loadingModels = ref(false),
  testing = ref(false);
let modelRequest: AbortController | null = null;
const providers = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'siliconflow', label: '硅基流动 · SiliconFlow' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'google_ai_studio', label: 'Google AI Studio' },
  { value: 'vertex_ai', label: 'Google Vertex AI' },
];
const profileOptions = computed(() => [
  { value: '', label: '当前编辑配置' },
  ...phone.settings.apiProfiles.map(p => ({ value: p.id, label: p.name })),
]);
const samplingOff = computed(() => omitSampling(phone.settings.api.model));
const samplingFields = [
  { key: 'temperature', label: '温度', min: 0, max: 2, step: 0.05 },
  { key: 'frequencyPenalty', label: '频率惩罚', min: -2, max: 2, step: 0.1 },
  { key: 'presencePenalty', label: '存在惩罚', min: -2, max: 2, step: 0.1 },
  { key: 'topP', label: 'Top P', min: 0, max: 1, step: 0.05 },
  { key: 'topK', label: 'Top K', min: 0, max: 500, step: 1 },
] as const;
watch(
  () => phone.settings.activeApiProfileId,
  id => {
    profileName.value = phone.settings.apiProfiles.find(p => p.id === id)?.name || '';
  },
  { immediate: true },
);
watch(
  () => [phone.settings.api.provider, phone.settings.api.apiurl, phone.settings.api.key],
  () => {
    modelRequest?.abort();
    models.value = [];
    modelError.value = '';
    loadingModels.value = false;
  },
);
function changeProvider(value: string) {
  phone.settings.api.provider = value as Provider;
  phone.settings.api.apiurl = providerDefaults[value as Provider] || '';
  phone.settings.api.model = '';
}
function validated() {
  const api = ApiSettingsSchema.parse(klona(phone.settings.api));
  if (api.contextLength <= api.maxTokens) throw Error('上下文长度必须大于最大回复长度。');
  return api;
}
function selectProfile(id: string) {
  const profile = phone.settings.apiProfiles.find(p => p.id === id);
  if (profile) phone.settings.api = klona(profile.api);
  phone.settings.activeApiProfileId = id;
  phone.saveSettings();
  feedback.value = '配置已切换';
}
function save() {
  try {
    phone.settings.api = validated();
    const profile = phone.settings.apiProfiles.find(p => p.id === phone.settings.activeApiProfileId);
    if (profile) {
      profile.api = klona(phone.settings.api);
      profile.name = profileName.value || profile.name;
    }
    phone.saveSettings();
    feedback.value = '配置已保存';
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '无法保存';
  }
}
function saveAs() {
  try {
    const api = validated();
    if (!profileName.value) throw Error('请填写配置名称。');
    const id = `api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    phone.settings.apiProfiles.push({ id, name: profileName.value, api: klona(api) });
    phone.settings.api = api;
    phone.settings.activeApiProfileId = id;
    phone.saveSettings();
    feedback.value = '已另存为新配置';
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '无法保存';
  }
}
function removeProfile() {
  phone.settings.apiProfiles = phone.settings.apiProfiles.filter(p => p.id !== phone.settings.activeApiProfileId);
  phone.settings.activeApiProfileId = '';
  phone.saveSettings();
  feedback.value = '已删除保存项，当前连接仍可继续编辑';
}
async function loadModels() {
  modelRequest?.abort();
  const controller = new AbortController();
  modelRequest = controller;
  loadingModels.value = true;
  modelError.value = '';
  try {
    const result = await fetchApiModels(klona(phone.settings.api), controller.signal);
    if (!controller.signal.aborted) models.value = result;
  } catch (e) {
    if (!controller.signal.aborted) modelError.value = e instanceof Error ? e.message : '模型拉取失败';
  } finally {
    if (modelRequest === controller) loadingModels.value = false;
  }
}
async function test() {
  testing.value = true;
  feedback.value = '';
  try {
    const settings = klona(phone.settings);
    settings.api = validated();
    await testSecondaryApi(settings);
    feedback.value = '连接成功';
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '连接失败';
  } finally {
    testing.value = false;
  }
}
onUnmounted(() => modelRequest?.abort());
</script>
