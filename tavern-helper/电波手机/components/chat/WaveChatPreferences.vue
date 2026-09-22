<template>
  <WaveContactSettings ref="contactSettings" />
  <section class="chat-settings-group">
    <div class="wave-settings-title">翻译</div>
    <label class="chat-setting-row"
      ><span>自动翻译<small>新收到的文字消息附带译文</small></span
      ><WaveToggle v-model="draft.autoTranslate" aria-label="自动翻译" />
    </label>
    <label class="chat-setting-row"
      ><span>自动展开翻译<small>关闭后点击气泡下的翻译按钮查看</small></span
      ><WaveToggle v-model="draft.expandTranslation" aria-label="自动展开翻译" />
    </label>
    <label class="chat-setting-row"
      ><span>角色输出语言</span><WaveSelect v-model="draft.sourceLanguage" :options="languages" />
    </label>
    <label class="chat-setting-row"
      ><span>翻译为</span><WaveSelect v-model="draft.targetLanguage" :options="languages" />
    </label>
    <label class="chat-setting-row"
      ><span>自动译出我的消息<small>发送译文，气泡下保留我输入的原文</small></span
      ><WaveToggle v-model="draft.outgoingTranslation" aria-label="自动译出我的消息" />
    </label>
    <template v-if="draft.outgoingTranslation">
      <label class="chat-setting-row"
        ><span>我的输入语言</span
        ><WaveSelect v-model="draft.inputLanguage" :options="languages" aria-label="我的输入语言"
      /></label>
      <label class="chat-setting-row"
        ><span>我的消息译为</span
        ><WaveSelect
          :model-value="draft.outgoingLanguage || draft.sourceLanguage"
          :options="languages"
          aria-label="我的消息译出语言"
          @update:model-value="value => (draft.outgoingLanguage = value)"
      /></label>
    </template>
    <p class="chat-settings-note">
      输入时预览译文，发送后角色收到译文，原文保留在第二个气泡。服务在“聊天与行为”中配置。
    </p>
  </section>
  <section class="chat-settings-group">
    <div class="wave-settings-title">时间与感知</div>
    <div class="chat-setting-block">
      <span>时间模式</span>
      <div class="chat-segments">
        <button
          v-for="mode in modes"
          :key="mode.value"
          type="button"
          :aria-pressed="draft.timeMode === mode.value"
          @click="draft.timeMode = mode.value"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>
    <label v-if="draft.timeMode === 'custom'" class="chat-setting-block"
      >自定义时间<input v-model="draft.customTime" placeholder="2026-09-13T11:23:00+08:00" /><small
        >填写带时区偏移的日期时间，双方时钟同步换算。</small
      ></label
    >
    <template v-if="draft.timeMode !== 'off'">
      <label class="chat-setting-row"
        ><span>异地模式</span><WaveToggle v-model="draft.distant" aria-label="异地模式" />
      </label>
      <template v-for="side in draft.distant ? (['user', 'char'] as const) : (['user'] as const)" :key="side">
        <div class="chat-setting-block">
          <div class="wave-settings-caption">{{ side === 'user' ? '我的位置' : '角色位置' }}</div>
          <label
            >虚拟位置名称<input
              v-model="draft[side === 'user' ? 'userLocation' : 'charLocation']"
              placeholder="填写故事中的地点"
          /></label>
          <label
            >时区<WaveSelect v-model="draft[side === 'user' ? 'userTimezone' : 'charTimezone']" :options="timezones"
          /></label>
          <button
            v-if="side === 'user' && phone.weatherLocation"
            type="button"
            class="chat-location-link"
            @click="useWeatherLocation"
          >
            使用日历城市 · {{ phone.weatherLocation.name }}
          </button>
        </div>
      </template>
      <p class="chat-clock-preview">{{ preview }}</p>
    </template>
    <p v-else class="chat-settings-note">不注入现实日期与地点，沿用故事中的时间。</p>
    <p v-if="error" role="alert" class="weather-error">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import WaveContactSettings from './WaveContactSettings.vue';
import { computed, ref, watch } from 'vue';
import { useNow } from '@vueuse/core';
import { usePhoneStore } from '../../stores/phone';
import { ChatPreferencesSchema, worldContext } from '../../services/chat/chat-preferences';
import WaveToggle from '../shared/WaveToggle.vue';
import { translationLanguages } from '../../services/generation/translation';
import WaveSelect from '../shared/WaveSelect.vue';
const phone = usePhoneStore();
const contactSettings = ref<InstanceType<typeof WaveContactSettings> | null>(null);
const draft = ref(ChatPreferencesSchema.parse({}));
const error = ref('');
const now = useNow({ interval: 1000 });
watch(
  () => phone.state.activeCharKey,
  key => {
    draft.value = ChatPreferencesSchema.parse(phone.state.chatPreferences[key]);
  },
  { immediate: true },
);
const languages = translationLanguages;
const modes = [
  { value: 'real', label: '真实' },
  { value: 'off', label: '关闭' },
  { value: 'custom', label: '自定义' },
] as const;
const timezones = computed(() =>
  [
    ...new Set([
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...((Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') || [
        'Asia/Shanghai',
        'Asia/Seoul',
        'Asia/Tokyo',
        'Europe/London',
        'America/New_York',
        'America/Los_Angeles',
        'UTC',
      ]),
      draft.value.userTimezone,
      draft.value.charTimezone,
    ]),
  ]
    .sort()
    .map(value => ({ value, label: value })),
);
const preview = computed(() => {
  try {
    return worldContext(draft.value, now.value).split('\n').slice(1, 3).join('\n');
  } catch {
    return '等待有效日期时间';
  }
});
function save(): boolean {
  try {
    if (contactSettings.value && !contactSettings.value.save()) return false;
    if (draft.value.timeMode === 'custom' && !draft.value.customTime) draft.value.customTime = new Date().toISOString();
    if (draft.value.timeMode === 'custom' && !/(Z|[+-]\d{2}:\d{2})$/i.test(draft.value.customTime))
      throw Error('日期时间末尾需包含时区，例如 +08:00。');
    worldContext(draft.value);
    phone.setChatPreferences(draft.value);
    error.value = '';
    return true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法保存';
    return false;
  }
}
defineExpose({ save });
function useWeatherLocation() {
  const location = phone.weatherLocation;
  if (!location) return;
  draft.value.userLocation = location.name;
  draft.value.userTimezone =
    location.timezone === 'auto' ? Intl.DateTimeFormat().resolvedOptions().timeZone : location.timezone;
  save();
}
</script>
