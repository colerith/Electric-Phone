<template>
  <section class="wave-image-settings image-settings-manager">
    <section class="image-section">
      <div class="image-heading">
        <div><strong>接口配置</strong><small>多套配置，按角色选择使用</small></div>
        <span class="image-count">{{ profiles.length }} 套</span>
      </div>
      <label v-if="profiles.length"
        >当前配置<WaveSelect v-model="selected" :options="profiles.map(p => ({ value: p.id, label: p.name }))"
      /></label>
      <label v-if="profile">配置名称<input v-model="profile.name" @change="save" /></label>
      <div class="image-actions image-profile-actions">
        <button type="button" @click="add('novelai')">＋ NovelAI</button
        ><button type="button" @click="add('openai')">＋ GPT Image</button
        ><button type="button" @click="importProfiles">读取柏宝绘配置</button>
        <button type="button" :disabled="!profile" @click="remove">删除此配置</button>
      </div>
      <p v-if="!profiles.length" class="image-empty">添加生图接口，再到私聊「角色生图」中选择它。</p>
      <p class="image-help">修改自动保存；读取柏宝绘会更新对应来源的接口配置。</p>
      <p v-if="status" class="image-status" role="status">{{ status }}</p>
    </section>
    <section class="image-section">
      <div class="image-heading"><strong>每轮生图数量</strong></div>
      <WaveMediaRange
        :model-value="phone.settings.imageServices.generation"
        :fallback="phone.settings.imageServices.generation"
        noun="生图"
        unit="张"
        @update:model-value="
          value => {
            if (value) {
              phone.settings.imageServices.generation = value;
              phone.saveSettings();
            }
          }
        "
      />
    </section>
    <template v-if="profile">
      <section class="image-section">
        <div class="image-heading">
          <strong>连接设置</strong
          ><span class="image-count">{{ profile.provider === 'novelai' ? 'NovelAI' : 'GPT Image' }}</span>
        </div>
        <label
          >接口地址<input
            v-model.trim="profile.baseUrl"
            type="url"
            :placeholder="profile.provider === 'novelai' ? 'https://image.novelai.net' : 'https://api.openai.com'"
            @change="save"
          /><small>留空使用官方服务，也可填写兼容代理地址。</small></label
        >
        <label
          >API 密钥<input
            v-model.trim="profile.apiKey"
            type="password"
            autocomplete="new-password"
            placeholder="输入密钥"
            @change="save"
        /></label>
      </section>
      <section class="image-section">
        <div class="image-heading">
          <strong>模型选择</strong
          ><button type="button" :disabled="loading" @click="refreshModels">
            {{ loading ? '读取中…' : '拉取模型列表' }}
          </button>
        </div>
        <label
          >生成模型<WaveSelect
            :model-value="profile.model"
            :options="models.map(value => ({ value, label: value }))"
            @update:model-value="changeModel"
        /></label>
        <details>
          <summary>手动填写模型 ID</summary>
          <label
            ><span class="wave-visually-hidden">模型 ID</span
            ><input v-model.trim="profile.model" aria-label="模型 ID" @change="save"
          /></label>
        </details>
      </section>
      <section class="image-section">
        <div class="image-heading"><strong>画面提示</strong></div>
        <label
          >前置提示词<textarea
            v-model="profile.prefix"
            rows="3"
            placeholder="这套配置共用的画风、画师串、质量词…"
            @change="save"
          />
        </label>
        <label v-if="profile.provider === 'novelai'"
          >负面提示词<textarea v-model="profile.negative" rows="3" placeholder="不希望出现的画面特征" @change="save" />
        </label>
        <p class="image-help">角色专属外貌在私聊内配置，生成时会与这里的提示词合并。</p>
      </section>
      <section class="image-section">
        <div class="image-heading"><strong>生成参数</strong></div>
        <template v-if="profile.provider === 'novelai'">
          <div class="image-grid">
            <label
              >宽度<input v-model.number="profile.width" type="number" min="256" max="2048" step="64" @change="save"
            /></label>
            <label
              >高度<input v-model.number="profile.height" type="number" min="256" max="2048" step="64" @change="save"
            /></label>
            <label
              >生成步数<input v-model.number="profile.steps" type="number" min="1" max="50" @change="save"
            /></label>
            <label
              >提示词引导<input v-model.number="profile.scale" type="number" min="0" max="10" step="0.1" @change="save"
            /></label>
          </div>
          <small>宽高需为 64 的倍数。</small>
          <details>
            <summary>高级采样参数</summary>
            <label>采样器<WaveSelect v-model="profile.sampler" :options="samplers" @update:model-value="save" /></label>
            <label
              >噪声调度<WaveSelect v-model="profile.noiseSchedule" :options="schedules" @update:model-value="save"
            /></label>
            <div class="image-grid">
              <label
                >CFG Rescale<input
                  v-model.number="profile.cfgRescale"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  @change="save" /></label
              ><label
                >种子（0 为随机）<input
                  v-model.number="profile.seed"
                  type="number"
                  min="0"
                  max="4294967295"
                  @change="save"
              /></label>
            </div>
          </details>
        </template>
        <template v-else
          ><label
            >画幅<WaveSelect
              :model-value="`${profile.width}x${profile.height}`"
              :options="sizes"
              @update:model-value="changeSize" /></label
          ><label
            >生成质量<WaveSelect v-model="profile.quality" :options="qualities" @update:model-value="save" /></label
          ><small>xhigh / max 仅适用于支持它们的模型。</small></template
        >
      </section>
      <WaveVibeSettings
        v-if="profile.provider === 'novelai'"
        :key="profile.id"
        :profile-id="profile.id"
        :model="profile.model"
        :model-value="profile.vibes"
        :normalize="profile.normalizeRefStrength"
        @update:model-value="
          value => {
            profile!.vibes = value;
            save();
          }
        "
        @update:normalize="
          value => {
            profile!.normalizeRefStrength = value;
            save();
          }
        "
      />
    </template>
  </section>
  <button class="settings-save-wide" type="button" @click="saveAll">
    <i class="fa-solid fa-floppy-disk"></i> 保存图像生成
  </button>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { IMAGE_MODELS, ImageProfileSchema, type ImageProfile } from '../../services/image/schema';
import { fetchImageModels } from '../../services/image/generate';
import { baibaiSettings, importBaibaiProfiles } from '../../services/image/baibai';
import WaveMediaRange from '../shared/WaveMediaRange.vue';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveVibeSettings from './WaveVibeSettings.vue';
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
const samplers = [
  'k_euler_ancestral',
  'k_euler',
  'k_dpmpp_2s_ancestral',
  'k_dpmpp_2m',
  'k_dpmpp_sde',
  'k_dpmpp_2m_sde',
].map(value => ({ value, label: value }));
const schedules = ['karras', 'native', 'exponential', 'polyexponential'].map(value => ({ value, label: value }));
const qualities = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map(value => ({ value, label: value }));
function saveAll() {
  const parsed = ImageProfileSchema.array().safeParse(profiles.value);
  if (!parsed.success) {
    status.value = '参数超出范围，请检查各配置的宽高、步数、强度或种子';
    return;
  }
  phone.settings.imageServices.profiles = parsed.data;
  phone.saveSettings();
  status.value = '图像生成设置已保存';
  if (phone.settings.notifications.toastEnabled) toastr.success(status.value, '电波手机');
}
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
