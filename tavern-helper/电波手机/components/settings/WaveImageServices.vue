<template>
  <section class="wave-image-settings">
    <div class="image-actions">
      <button type="button" @click="add('novelai')">＋ NovelAI</button>
      <button type="button" @click="add('openai')">＋ GPT Image</button>
      <button type="button" @click="importProfiles">读取柏宝绘配置</button>
    </div>
    <p class="image-help">配置自动保存。导入会更新同名来源的柏宝绘接口，保留手动添加的配置。</p>
    <p v-if="status" role="status" class="image-status">{{ status }}</p>
    <p v-if="!profiles.length" class="image-empty">添加一个生图接口，再到私聊「角色生图」中选择它。</p>
    <template v-else>
      <label
        >当前配置<WaveSelect v-model="selected" :options="profiles.map(p => ({ value: p.id, label: p.name }))"
      /></label>
      <div v-if="profile" :key="profile.id" class="image-profile">
        <div class="image-heading">
          <strong>{{ profile.provider === 'novelai' ? 'NovelAI' : 'GPT Image' }}</strong
          ><button type="button" @click="remove">删除配置</button>
        </div>
        <label>配置名称<input v-model="profile.name" @change="save" /></label>
        <label
          >API 地址<input
            v-model.trim="profile.baseUrl"
            type="url"
            :placeholder="profile.provider === 'novelai' ? 'https://image.novelai.net' : 'https://api.openai.com'"
            @change="save"
        /></label>
        <label
          >API 密钥<input v-model.trim="profile.apiKey" type="password" autocomplete="new-password" @change="save"
        /></label>
        <label
          >模型<WaveSelect
            :model-value="profile.model"
            :options="models.map(value => ({ value, label: value }))"
            @update:model-value="value => changeModel(value)"
        /></label>
        <div class="image-actions">
          <button type="button" :disabled="loading" @click="refreshModels">
            {{ loading ? '读取中…' : '拉取模型列表' }}
          </button>
        </div>
        <label>模型 ID（可手动填写）<input v-model.trim="profile.model" @change="save" /></label>
        <label
          >通用前置提示词<textarea
            v-model="profile.prefix"
            rows="3"
            placeholder="画风、画师串、质量词…"
            @change="save"
          />
        </label>
        <template v-if="profile.provider === 'novelai'">
          <label>负面提示词<textarea v-model="profile.negative" rows="3" @change="save" /></label>
          <div class="image-grid">
            <label
              >宽度<input v-model.number="profile.width" type="number" min="256" max="2048" step="64" @change="save"
            /></label>
            <label
              >高度<input v-model.number="profile.height" type="number" min="256" max="2048" step="64" @change="save"
            /></label>
            <label>步数<input v-model.number="profile.steps" type="number" min="1" max="50" @change="save" /></label>
            <label
              >引导强度<input v-model.number="profile.scale" type="number" min="0" max="10" step="0.1" @change="save"
            /></label>
          </div>
          <details>
            <summary>更多参数</summary>
            <label>采样器<input v-model.trim="profile.sampler" @change="save" /></label>
            <label>噪声调度<input v-model.trim="profile.noiseSchedule" @change="save" /></label>
            <label
              >CFG Rescale<input
                v-model.number="profile.cfgRescale"
                type="number"
                min="0"
                max="1"
                step="0.01"
                @change="save"
            /></label>
            <label
              >种子（0 为随机）<input
                v-model.number="profile.seed"
                type="number"
                min="0"
                max="4294967295"
                @change="save"
            /></label>
            <div class="image-heading">
              <span>参考强度归一化</span
              ><WaveToggle
                v-model="profile.normalizeRefStrength"
                aria-label="参考强度归一化"
                @update:model-value="save"
              />
            </div>
          </details>
        </template>
        <template v-else>
          <label
            >画幅<WaveSelect
              :model-value="`${profile.width}x${profile.height}`"
              :options="sizes"
              @update:model-value="changeSize"
          /></label>
          <label>质量<WaveSelect v-model="profile.quality" :options="qualities" @update:model-value="save" /></label>
          <small>xhigh / max 仅供支持它们的新模型使用；兼容接口以其实际支持为准。</small>
        </template>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { IMAGE_MODELS, ImageProfileSchema, type ImageProfile } from '../../services/image/schema';
import { fetchImageModels } from '../../services/image/generate';
import { baibaiSettings, importBaibaiProfiles } from '../../services/image/baibai';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveToggle from '../shared/WaveToggle.vue';
const phone = usePhoneStore();
const profiles = ref(klona(phone.settings.imageServices.profiles));
const selected = ref(profiles.value[0]?.id || '');
const profile = computed(() => profiles.value.find(p => p.id === selected.value));
const remoteModels = ref<Record<string, string[]>>({});
const models = computed(() =>
  profile.value
    ? [
        ...new Set([
          profile.value.model,
          ...(remoteModels.value[profile.value.id] || IMAGE_MODELS[profile.value.provider]),
        ]),
      ]
    : [],
);
const loading = ref(false),
  status = ref('');
const sizes = ['1024x1024', '1536x1024', '1024x1536'].map(value => ({ value, label: value.replace('x', ' × ') }));
const qualities = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map(value => ({ value, label: value }));
function save() {
  const result = ImageProfileSchema.safeParse(profile.value);
  if (!result.success) {
    status.value = '参数超出范围，请检查宽高、步数、强度或种子';
    return;
  }
  const index = phone.settings.imageServices.profiles.findIndex(p => p.id === result.data.id);
  if (index < 0) phone.settings.imageServices.profiles.push(result.data);
  else phone.settings.imageServices.profiles[index] = result.data;
  phone.saveSettings();
  status.value = '已保存';
}
function add(provider: ImageProfile['provider']) {
  const value = ImageProfileSchema.parse({
    id: crypto.randomUUID(),
    provider,
    name: `${provider === 'novelai' ? 'NovelAI' : 'GPT Image'} ${profiles.value.length + 1}`,
    model: IMAGE_MODELS[provider][0],
  });
  profiles.value.push(value);
  selected.value = value.id;
  save();
}
function remove() {
  phone.settings.imageServices.profiles = phone.settings.imageServices.profiles.filter(p => p.id !== selected.value);
  profiles.value = profiles.value.filter(p => p.id !== selected.value);
  selected.value = profiles.value[0]?.id || '';
  phone.saveSettings();
  status.value = '已删除；使用此配置的角色需重新选择接口';
}
function changeModel(value: string) {
  if (profile.value) {
    profile.value.model = value;
    save();
  }
}
function changeSize(value: string) {
  if (profile.value) {
    const [width, height] = value.split('x').map(Number);
    Object.assign(profile.value, { width, height });
    save();
  }
}
async function refreshModels() {
  if (!profile.value || loading.value) return;
  const validated = ImageProfileSchema.safeParse(profile.value);
  if (!validated.success) {
    status.value = '请先修正配置中的参数';
    return;
  }
  const snapshot = validated.data;
  loading.value = true;
  try {
    remoteModels.value[snapshot.id] = await fetchImageModels(snapshot);
    status.value = '已读取接口模型，并补齐内置模型';
  } catch (e) {
    status.value = e instanceof Error ? e.message : '读取失败，已保留内置列表';
  } finally {
    loading.value = false;
  }
}
function importProfiles() {
  try {
    const result = importBaibaiProfiles(baibaiSettings(), phone.settings.imageServices.profiles);
    phone.settings.imageServices.profiles = result.profiles;
    profiles.value = klona(result.profiles);
    selected.value = result.profiles.find(p => p.id.startsWith('baibai-'))?.id || '';
    phone.saveSettings();
    status.value = `已导入 ${result.count} 个柏宝绘接口及画风参数`;
  } catch (e) {
    status.value = e instanceof Error ? e.message : '导入失败';
  }
}
</script>
<style scoped lang="scss" src="./image-settings.scss"></style>
