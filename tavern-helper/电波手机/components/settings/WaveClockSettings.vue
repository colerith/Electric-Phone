<template>
  <section class="settings-card system-settings-card wave-clock-settings">
    <div class="wave-settings-title">系统时间</div>
    <p class="clock-preview" aria-live="polite">{{ clock.labels.full }}</p>
    <label>时间来源<WaveSelect v-model="settings.source" :options="sources" aria-label="系统时间来源" /></label>
    <template v-if="settings.source === 'timezone'">
      <label>时区<WaveSelect v-model="settings.timeZone" :options="zones" aria-label="系统时区" /></label>
      <label v-if="settings.timeZone === 'iana'"
        >时区名称<input v-model="settings.customZone" placeholder="例如 Europe/Paris"
      /></label>
      <label v-if="settings.timeZone === 'offset'"
        >相对 UTC 的偏移（分钟）<input
          v-model.number="settings.offsetMinutes"
          type="number"
          min="-720"
          max="840"
          step="15"
      /></label>
      <p>默认东八区北京时间。地区时区自动处理夏令时；固定偏移 480 分钟即 UTC+08:00。</p>
    </template>
    <template v-else-if="settings.source === 'custom'">
      <label>自定义日期时间<input v-model="settings.customTime" type="datetime-local" @input="resetAnchor" /></label>
      <div class="system-toggle-row">
        <span>自动走时</span
        ><WaveToggle
          :model-value="settings.customRunning"
          aria-label="自定义时间自动走时"
          @update:model-value="setRunning"
        />
      </div>
      <p>关闭时停留在指定时间；开启后从指定时间开始，按真实经过时长前进。</p>
    </template>
    <template v-else>
      <p>读取柏宝书摘要页的当前时间，实时监听更新。分钟与日期不会自动增加，也不会读取摘要卡片里的历史时间段。</p>
      <p role="status">{{ clock.status }}</p>
      <button type="button" class="system-action clock-refresh" @click="clock.refresh()">
        <i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新读取</span>
      </button>
    </template>
    <p v-if="error" class="clock-error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { useSystemClockStore } from '../../stores/system-clock';
import { parseCivilTime, validTimeZone } from '../../services/core/system-clock';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveToggle from '../shared/WaveToggle.vue';
const phone = usePhoneStore(),
  clock = useSystemClockStore();
const settings = computed(() => phone.settings.basic.systemClock);
const sources = [
  { value: 'timezone', label: '按时区显示真实时间' },
  { value: 'custom', label: '自定义日期时间' },
  { value: 'baibai', label: '跟随柏宝书时间（不自动走时）' },
];
const zones = [
  { value: 'Asia/Shanghai', label: '北京时间 · UTC+08:00' },
  { value: 'Asia/Tokyo', label: '东京 · UTC+09:00' },
  { value: 'Asia/Kolkata', label: '印度 · UTC+05:30' },
  { value: 'Europe/London', label: '伦敦 · 自动夏令时' },
  { value: 'Europe/Paris', label: '巴黎 · 自动夏令时' },
  { value: 'America/New_York', label: '纽约 · 自动夏令时' },
  { value: 'America/Los_Angeles', label: '洛杉矶 · 自动夏令时' },
  { value: 'Australia/Sydney', label: '悉尼 · 自动夏令时' },
  { value: 'UTC', label: 'UTC · 协调世界时' },
  { value: 'offset', label: '自定义固定 UTC 偏移' },
  { value: 'iana', label: '其他地区时区' },
];
const error = computed(() => {
  const value = settings.value;
  if (value.source === 'custom' && parseCivilTime(value.customTime) === null) return '请填写有效的日期与时间。';
  if (value.source === 'timezone' && value.timeZone === 'iana' && !validTimeZone(value.customZone))
    return '无法识别该时区，请填写例如 Asia/Shanghai 或 Europe/Paris。';
  return '';
});
function resetAnchor() {
  settings.value.customAnchor = Date.now();
}
function setRunning(value: boolean) {
  if (clock.value !== null) settings.value.customTime = new Date(clock.value).toISOString().slice(0, 16);
  settings.value.customRunning = value;
  resetAnchor();
}
watch(
  () => settings.value.source,
  source => {
    if (source === 'custom' && !settings.value.customTime) {
      settings.value.customTime = new Date(Date.now() + 480 * 60000).toISOString().slice(0, 16);
      resetAnchor();
    }
  },
);
</script>
<style lang="scss">
#wave-phone-script-root .wave-device .wave-clock-settings .clock-preview {
  font-size: 16px;
  font-weight: 600;
  color: var(--wave-ink);
  padding-top: 12px;
}
#wave-phone-script-root .wave-device .wave-clock-settings .clock-error {
  color: #b84b58;
}
</style>
