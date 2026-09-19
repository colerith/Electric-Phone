<template>
  <section class="portrait-home" aria-label="手机首页">
    <div ref="pages" class="portrait-pages" @scroll.passive="onScroll">
      <div class="portrait-page portrait-cover-page" aria-label="角色封面">
        <aside class="portrait-rail">
          <div class="portrait-rail-clock">
            <span>{{ clock.split(':')[0] }}</span
            ><i></i><span>{{ clock.split(':')[1] }}</span>
          </div>
          <button type="button" aria-label="打开消息" @click="$emit('open', 'messages')">
            <i class="fa-solid fa-comment-dots"></i><small>MESSAGE</small>
          </button>
          <div class="portrait-rail-spacer"></div>
          <button type="button" aria-label="打开音乐" @click="$emit('open', 'music')">
            <i class="fa-solid fa-headphones"></i>
          </button>
          <button type="button" aria-label="显示应用" @click="go(1)"><i class="fa-solid fa-layer-group"></i></button>
          <button type="button" aria-label="打开设置" @click="$emit('settings')">
            <i class="fa-solid fa-sliders"></i>
          </button>
        </aside>
        <div class="portrait-cover">
          <img
            v-if="phone.settings.appearance.coverWallpaper || cover"
            class="portrait-image"
            :src="phone.settings.appearance.coverWallpaper || cover"
            alt="角色卡原始封面"
            decoding="async"
            @error="imageFailed"
          />
          <div v-else class="portrait-empty"><i class="fa-regular fa-image"></i><span>暂无角色卡封面</span></div>
          <div class="portrait-cover-fade"></div>
          <div class="portrait-greeting">
            <div class="portrait-greeting-en">{{ greeting }}</div>
            <div class="portrait-greeting-name">Hello {{ userName || '朋友' }}</div>
            <form class="portrait-search" @submit.prevent="go(1)">
              <i class="fa-solid fa-magnifying-glass"></i
              ><input v-model="query" placeholder="搜索应用" aria-label="搜索应用" /><button
                type="submit"
                aria-label="搜索"
              >
                搜索
              </button>
            </form>
            <button class="portrait-agenda" type="button" @click="$emit('open', 'calendar')">
              <span>日程</span><strong>{{ agenda || '留一点时间，给今天' }}</strong
              ><i class="fa-solid fa-angle-right"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="portrait-page portrait-app-page" aria-label="应用列表">
        <div class="ios-home-scroll">
          <div class="ios-six-grid" :class="{ 'is-searching': query }">
            <div v-if="!query" class="ios-anniversary-widget">
              <div class="anniversary-portraits" aria-label="我和你一起听">
                <div class="anniversary-avatar">
                  <img v-if="userAvatar" :src="userAvatar" alt="我" /><span v-else>我</span>
                </div>
                <div class="anniversary-avatar">
                  <img
                    v-if="phone.activeIdentity?.avatar || cover"
                    :src="phone.activeIdentity?.avatar || cover"
                    alt="你"
                  /><span v-else>你</span>
                </div>
                <svg class="anniversary-headphones" viewBox="0 0 240 180" fill="none" aria-hidden="true">
                  <defs>
                    <linearGradient
                      id="wave-anniversary-cable"
                      gradientUnits="userSpaceOnUse"
                      x1="0"
                      y1="77"
                      x2="0"
                      y2="178"
                    >
                      <stop offset="0" stop-color="#ffffff" />
                      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.85" />
                      <stop offset="0.75" stop-color="#ffffff" stop-opacity="0.35" />
                      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M15 77 C-9 101 25 135 46 178 M225 77 C249 101 215 135 194 178"
                    stroke="url(#wave-anniversary-cable)"
                    stroke-width="3"
                    stroke-linecap="round"
                  />
                  <rect x="7" y="64" width="11" height="23" rx="5.5" fill="#ffffff" />
                  <rect x="222" y="64" width="11" height="23" rx="5.5" fill="#ffffff" />
                </svg>
              </div>
              <div class="anniversary-copy">
                <small>与你 · 每一天</small>
                <strong
                  >{{ anniversaryDays === null ? '待开启' : anniversaryDays
                  }}<em v-if="anniversaryDays !== null"> 天</em></strong
                >
                <span>我们的纪念日</span>
                <small>{{ anniversary ? '一起走过的时光' : '前往外观设置纪念日' }}</small>
              </div>
            </div>
            <div v-if="!query" class="ios-ipod-widget" aria-label="iPod 音乐播放器">
              <button class="ipod-screen" type="button" aria-label="打开音乐播放器" @click="$emit('open', 'music')">
                <span
                  >ON MY WAVE<strong>{{ musicTitle || '留一首歌的时间' }}</strong
                  ><small>{{ music.playing ? '正在播放' : '音乐 · 随身听' }}</small></span
                >
              </button>
              <div class="ipod-wheel">
                <button class="ipod-menu" type="button" @click="$emit('open', 'music')">MENU</button>
                <button class="ipod-prev" type="button" aria-label="上一首" @click="music.step(-1)">
                  <i class="fa-solid fa-backward-fast"></i>
                </button>
                <button
                  class="ipod-center"
                  type="button"
                  aria-label="打开当前歌曲"
                  @click="$emit('open', 'music')"
                ></button>
                <button class="ipod-next" type="button" aria-label="下一首" @click="music.step(1)">
                  <i class="fa-solid fa-forward-fast"></i>
                </button>
                <button
                  class="ipod-play"
                  type="button"
                  :aria-label="music.playing ? '暂停' : '播放'"
                  @click="music.toggle()"
                >
                  <i class="fa-solid fa-play"></i><i class="fa-solid fa-pause"></i>
                </button>
              </div>
            </div>
            <button
              v-if="!query"
              class="ios-note-widget"
              type="button"
              aria-label="打开便签"
              @click="$emit('open', 'memo')"
            >
              <small>NOTE TO SELF</small><span>今天的小事 ♡</span
              ><strong>{{ agenda || '慢慢来，把喜欢的瞬间留下。' }}</strong
              ><span>写一笔日常 ↗</span>
            </button>
            <button
              v-for="app in filteredApps"
              :key="app.id"
              class="ios-app-icon"
              :class="`ios-icon-${app.id}`"
              type="button"
              @click="$emit('open', app.id)"
            >
              <span
                ><img :src="phone.settings.appearance.iconImages[app.id] || appIcons[app.id]" alt="" /><b
                  v-if="app.id === 'messages' && unread"
                  class="ios-unread-badge"
                  >{{ unread > 99 ? '99+' : unread }}</b
                ><b v-else-if="updatedApps.includes(app.id)" class="ios-update-dot" aria-label="有新内容"></b></span
              ><strong>{{ phone.settings.appearance.iconNames[app.id] || app.name }}</strong>
            </button>
          </div>
          <div v-if="query" class="portrait-search-state">
            <span>{{ filteredApps.length ? '搜索：' + query : '没有找到应用' }}</span
            ><button type="button" @click="query = ''">清除</button>
          </div>
        </div>
        <nav class="ios-home-dock" aria-label="常用应用">
          <button
            class="ios-app-icon"
            type="button"
            :aria-label="phone.settings.appearance.iconNames.settings || '设置'"
            @click="$emit('settings')"
          >
            <span><img :src="phone.settings.appearance.iconImages.settings || appIcons.settings" alt="" /></span>
          </button>
          <button
            class="ios-app-icon"
            type="button"
            :aria-label="phone.settings.appearance.iconNames.appearance || '外观'"
            @click="$emit('appearance')"
          >
            <span><img :src="phone.settings.appearance.iconImages.appearance || appIcons.appearance" alt="" /></span>
          </button>
          <button
            class="ios-app-icon"
            type="button"
            aria-label="推特（开发中）"
            title="推特 · 开发中"
            @click="showTwitterPlaceholder"
          >
            <span><img :src="phone.settings.appearance.iconImages.twitter || appIcons.twitter" alt="" /></span>
          </button>
          <button
            type="button"
            class="ios-app-icon"
            :aria-label="phone.settings.appearance.iconNames.presets || '预设'"
            @click="$emit('presets')"
          >
            <span><img :src="phone.settings.appearance.iconImages.presets || presetIcon" alt="" /></span>
          </button>
        </nav>
      </div>
    </div>
    <nav class="portrait-pager" aria-label="首页分页">
      <button
        v-for="n in 2"
        :key="n"
        type="button"
        :aria-label="n === 1 ? '封面页' : '应用页'"
        :aria-current="page === n - 1 ? 'page' : undefined"
        @click="go(n - 1)"
      ></button>
    </nav>
  </section>
</template>
<script setup lang="ts">
function showTwitterPlaceholder() {
  toastr.info('推特暂为占位，敬请期待');
}
import { computed, ref, watch, onMounted } from 'vue';
import { presetIcon } from '../../assets/icons/preset-icon';
import { appIcons } from '../../assets/icons/app-icons';
import { usePhoneStore } from '../../stores/phone';
import { useMusicStore } from '../../stores/music';
import type { AppId } from '../../schemas';
const props = defineProps<{
  clock: string;
  userAvatar: string;
  musicTitle?: string;
  cardKey: string;
  sourceAvatar: string;
  userName: string;
  agenda: string;
  unread: number;
  updatedApps: AppId[];
  apps: Array<{ id: AppId; name: string; icon: string }>;
}>();
defineEmits<{ open: [id: AppId]; settings: []; appearance: []; presets: [] }>();
const phone = usePhoneStore();
const music = useMusicStore();
const page = defineModel<number>('page', { default: 0 });
onMounted(() => {
  if (pages.value) pages.value.scrollLeft = page.value * pages.value.clientWidth;
});
const pages = ref<HTMLElement | null>(null),
  query = ref(''),
  cover = ref(''),
  fallback = ref('');

const greeting = computed(() => {
  const hour = Number(props.clock.split(':')[0]);
  return hour < 6 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
});
const filteredApps = computed(() =>
  props.apps.filter(app =>
    (phone.settings.appearance.iconNames[app.id] || app.name).toLowerCase().includes(query.value.trim().toLowerCase()),
  ),
);
const anniversary = computed(() => phone.settings.appearance.anniversaries[props.cardKey] || '');
const anniversaryDays = computed(() => {
  void props.clock;
  if (!anniversary.value) return null;
  const start = new Date(anniversary.value + 'T00:00:00');
  const now = new Date();
  return Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
      86400000,
  );
});

watch(
  () => [props.cardKey, props.sourceAvatar],
  () => {
    // 只读取酒馆原卡资源，不访问 activeIdentity 的自定义头像和裁切信息。
    const original = String(getCharData('current')?.avatar || '');
    fallback.value = props.sourceAvatar;
    if (original && !original.includes('/') && !original.includes('\\'))
      cover.value = '/characters/' + encodeURIComponent(original);
    else cover.value = /^(https?:\/\/|data:image\/|\/characters\/)/i.test(original) ? original : props.sourceAvatar;
    query.value = '';
  },
  { immediate: true },
);
function imageFailed(event: Event) {
  if ((event.target as HTMLImageElement).getAttribute('src') !== cover.value) return;
  if (cover.value !== fallback.value) cover.value = fallback.value;
  else cover.value = '';
}
function go(index: number) {
  pages.value?.scrollTo({
    left: index * pages.value.clientWidth,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}
function onScroll() {
  if (pages.value?.clientWidth) page.value = Math.round(pages.value.scrollLeft / pages.value.clientWidth);
}
</script>
