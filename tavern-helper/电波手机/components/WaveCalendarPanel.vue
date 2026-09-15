<template>
  <section class="wave-app-content calendar-page">
    <article class="calendar-weather-card">
      <header>
        <button type="button" @click="$emit('settings')">
          <i class="fa-solid fa-location-dot"></i>{{ location?.name || '选择天气位置' }}</button
        ><button v-if="location" type="button" :disabled="busy" aria-label="刷新天气" @click="refresh(true)">
          <i :class="busy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
        </button>
      </header>
      <template v-if="weather">
        <div class="calendar-weather-main">
          <strong>{{ number(weather.current.temperature_2m) }}<small>°C</small></strong>
          <div>
            <span>高 {{ number(weather.daily.temperature_2m_max[0]) }}°</span
            ><span>低 {{ number(weather.daily.temperature_2m_min[0]) }}°</span>
          </div>
          <span class="calendar-weather-condition"
            ><i :class="`fa-solid ${condition.icon}`"></i><small>{{ condition.text }}</small></span
          >
        </div>
        <div class="calendar-weather-metrics">
          <span
            ><small>湿度</small><b>{{ number(weather.current.relative_humidity_2m) }}%</b></span
          ><span
            ><small>降水</small><b>{{ number(weather.current.precipitation, 1) }} mm</b></span
          ><span
            ><small>风速</small><b>{{ number(weather.current.wind_speed_10m, 1) }} m/s</b></span
          >
        </div>
        <footer>
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a
          ><span>{{ weather.current.time.replace('T', ' ') }} · {{ weather.timezone }}</span>
        </footer>
      </template>
      <p v-else class="calendar-weather-empty">
        {{ busy ? '正在读取当地天气…' : location ? '暂无天气数据' : '在右上角设置城市，查看当地天气。' }}
      </p>
      <p v-if="error" class="weather-error" role="status">{{ error }}</p>
    </article>
    <article class="calendar-days-card">
      <header>
        <label
          ><span>{{ selectedDate.slice(0, 4) }} 年 {{ Number(selectedDate.slice(5, 7)) }} 月</span
          ><input v-model="selectedDate" type="date" aria-label="选择日程日期" @change="alignDays" /></label
        ><button type="button" @click="today">今天</button>
      </header>
      <div class="calendar-five-days">
        <button
          v-for="day in days"
          :key="day.key"
          type="button"
          :aria-pressed="selectedDate === day.key"
          @click="
            selectedDate = day.key;
            allEvents = false;
          "
        >
          <small>{{ day.week }}</small
          ><strong>{{ day.day }}</strong
          ><i v-if="events.some(event => event.date === day.key)"></i>
        </button>
      </div>
      <div class="calendar-day-controls">
        <button type="button" aria-label="前五天" @click="moveDays(-5)"><i class="fa-solid fa-chevron-left"></i></button
        ><small>日期导航</small
        ><button type="button" aria-label="后五天" @click="moveDays(5)">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </article>
    <article class="calendar-timeline-card">
      <header>
        <strong>时间轴待办</strong
        ><button type="button" :aria-pressed="allEvents" @click="allEvents = !allEvents">
          {{ allEvents ? '查看选中日期' : '查看全部' }}
        </button>
      </header>
      <div
        v-for="event in filtered"
        :key="event.id"
        class="calendar-timeline-event"
        :class="{ done: event.done, important: event.important }"
      >
        <time
          ><span>{{ event.date || '日期待定' }}</span
          ><b>{{ event.time || '全天' }}</b></time
        ><span class="calendar-timeline-node"></span>
        <div>
          <strong>{{ event.important ? '重点事项' : '日程安排' }}<small v-if="event.done">已完成</small></strong
          ><button type="button" class="wave-content-delete" aria-label="删除日程" @click="$emit('delete', event.id)">
            <i class="fa-regular fa-trash-can"></i>
          </button>
          <p>{{ event.content }}</p>
        </div>
      </div>
      <p v-if="!filtered.length" class="calendar-empty">
        {{ allEvents ? '还没有日程，留一点时间给自己。' : '这一天暂无安排。' }}
      </p>
    </article>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { fetchWeather, weatherLabel, type WeatherLocation, type WeatherResponse } from '../services/weather';
import { dateKey, parseCalendar } from '../services/calendar';
const props = defineProps<{ raw: string; location: WeatherLocation | null }>();
defineEmits<{ settings: []; delete: [eventId: string] }>();
const selectedDate = ref(dateKey(new Date()));
const firstDay = ref(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 2));
const allEvents = ref(true);
const events = computed(() => parseCalendar(props.raw));
const filtered = computed(() => events.value.filter(event => allEvents.value || event.date === selectedDate.value));
const days = computed(() =>
  Array.from({ length: 5 }, (_, i) => {
    const date = new Date(firstDay.value);
    date.setDate(date.getDate() + i);
    return {
      key: dateKey(date),
      day: date.getDate(),
      week: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
    };
  }),
);
function alignDays(): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate.value)) {
    selectedDate.value = dateKey(new Date());
  }
  const date = new Date(`${selectedDate.value}T12:00:00`);
  date.setDate(date.getDate() - 2);
  firstDay.value = date;
  allEvents.value = false;
}
function today(): void {
  selectedDate.value = dateKey(new Date());
  alignDays();
}
function moveDays(amount: number): void {
  const date = new Date(firstDay.value);
  date.setDate(date.getDate() + amount);
  firstDay.value = new Date(date);
  date.setDate(date.getDate() + 2);
  selectedDate.value = dateKey(date);
  allEvents.value = false;
}
const weather = ref<WeatherResponse | null>(null);
const busy = ref(false);
const error = ref('');
let controller: AbortController | null = null;
let requestId = 0;
const condition = computed(() => weatherLabel(weather.value?.current.weather_code ?? null));
const number = (value: number | null | undefined, digits = 0) => (value == null ? '—' : value.toFixed(digits));
async function refresh(force = false): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const id = ++requestId;
  error.value = '';
  if (!props.location) {
    weather.value = null;
    busy.value = false;
    return;
  }
  busy.value = true;
  try {
    const data = await fetchWeather(props.location, controller.signal, force);
    if (id === requestId) weather.value = data;
  } catch {
    if (id === requestId)
      error.value = weather.value ? '刷新失败，当前显示上次数据。' : '天气加载失败，请检查网络后重试。';
  } finally {
    if (id === requestId) busy.value = false;
  }
}
watch(
  () => props.location,
  () => {
    weather.value = null;
    void refresh();
  },
  { immediate: true, deep: true },
);
onBeforeUnmount(() => {
  requestId++;
  controller?.abort();
});
</script>
