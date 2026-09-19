<template>
  <div class="calendar-location-settings">
    <div class="function-section-heading"><b>天气位置</b><small>真实城市天气</small></div>
    <div v-if="location" class="weather-location-current">
      <i class="fa-solid fa-location-dot"></i
      ><span
        ><strong>{{ location.name }}</strong
        ><small>{{ [location.admin1, location.country].filter(Boolean).join(' · ') }}</small></span
      ><button type="button" @click="$emit('select', null)">清除</button>
    </div>
    <form v-if="location" class="weather-name-editor" @submit.prevent="rename">
      <label>显示地名<input v-model.trim="displayName" maxlength="80" required aria-label="显示地名" /></label
      ><button type="submit">保存地名</button><small>只修改显示名称，天气仍来自所选城市坐标。</small>
    </form>
    <form class="weather-location-search" @submit.prevent="search">
      <input
        v-model="query"
        placeholder="搜索城市，如上海、Tokyo"
        aria-label="天气城市"
        minlength="2"
        required
      /><button type="submit" :disabled="busy">{{ busy ? '搜索中' : '搜索' }}</button>
    </form>
    <p v-if="error" class="weather-error" role="status">{{ error }}</p>
    <div class="weather-location-results">
      <button v-for="item in results" :key="`${item.latitude},${item.longitude}`" type="button" @click="choose(item)">
        <i class="fa-solid fa-location-dot"></i
        ><span
          ><strong>{{ item.name }}</strong
          ><small
            >{{ [item.admin1, item.country].filter(Boolean).join(' · ') }} · {{ item.latitude.toFixed(2) }},
            {{ item.longitude.toFixed(2) }}</small
          ></span
        ><i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
    <p class="function-settings-footnote">
      选择搜索结果后保存。只查询所选城市，无需设备定位权限。天气来自 Open-Meteo，与剧情日期独立。
    </p>
  </div>
</template>
<script setup lang="ts">
import { ref, onBeforeUnmount, watch } from 'vue';
import { searchWeatherLocations, type WeatherLocation } from '../../services/core/weather';
const props = defineProps<{ location: WeatherLocation | null }>();
const emit = defineEmits<{ select: [location: WeatherLocation | null] }>();
const displayName = ref('');
watch(
  () => props.location?.name,
  value => {
    displayName.value = value || '';
  },
  { immediate: true },
);
function rename(): void {
  if (props.location && displayName.value.trim()) emit('select', { ...props.location, name: displayName.value.trim() });
}
const query = ref('');
const results = ref<WeatherLocation[]>([]);
const busy = ref(false);
const error = ref('');
let controller: AbortController | null = null;
let requestId = 0;
watch(query, () => {
  controller?.abort();
  requestId++;
  busy.value = false;
  results.value = [];
  error.value = '';
});
async function search(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const id = ++requestId;
  busy.value = true;
  error.value = '';
  results.value = [];
  try {
    const data = await searchWeatherLocations(query.value, controller.signal);
    if (id !== requestId) return;
    results.value = data;
    if (!data.length) error.value = '没有找到城市，可以尝试英文名或加上国家。';
  } catch {
    if (id === requestId) error.value = '城市搜索失败，请检查网络后重试。';
  } finally {
    if (id === requestId) busy.value = false;
  }
}
function choose(location: WeatherLocation): void {
  emit('select', location);
  results.value = [];
}
onBeforeUnmount(() => {
  requestId++;
  controller?.abort();
});
</script>
