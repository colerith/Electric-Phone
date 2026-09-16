<template>
  <section
    class="wave-music-player"
    :class="{
      'music-home-view': music.view === 'home',
      'music-play-view': music.view === 'player',
      'is-playing': music.playing,
    }"
  >
    <template v-if="music.view === 'home'">
      <form v-if="!playlistDetail" class="music-search" @submit.prevent="search">
        <i class="fa-solid fa-magnifying-glass"></i
        ><input v-model="query" placeholder="搜索歌曲 / 歌手" aria-label="搜索歌曲" /><button
          type="submit"
          :disabled="music.busy"
        >
          搜索
        </button>
      </form>
      <nav v-if="!playlistDetail" class="music-home-tabs">
        <button
          type="button"
          :aria-pressed="!favoritesOnly && !libraryTab"
          @click="
            favoritesOnly = false;
            libraryTab = false;
          "
        >
          为你推荐</button
        ><button
          type="button"
          :aria-pressed="favoritesOnly && !libraryTab"
          @click="
            favoritesOnly = true;
            libraryTab = false;
          "
        >
          喜欢的歌
        </button>
        <button type="button" :aria-pressed="libraryTab" @click="libraryTab = true">我的歌单</button>
      </nav>
      <WavePlaylists v-if="libraryTab" @detail="playlistDetail = $event" />
      <template v-else>
        <p v-if="!favoritesOnly" class="music-recommendation-note">
          {{ music.recommendationBusy ? '正在获取今日旋律…' : music.recommendationNotice }}
          <button type="button" :disabled="music.recommendationBusy" @click="music.loadRecommendations()">刷新</button>
        </p>
        <div v-if="!favoritesOnly" class="music-feature-grid">
          <button class="music-feature" type="button" @click="playTrack(music.recommendations[0] || music.daily[0])">
            <small>FOR YOU</small><strong>{{ music.recommendations[0]?.title || '今日心动' }}</strong
            ><span>{{ intent.note || '让旋律替你收藏这一刻' }}</span
            ><img v-if="music.recommendations[0]?.cover" :src="music.recommendations[0].cover" alt="" /><i
              class="fa-solid fa-circle-play"
            ></i></button
          ><button class="music-feature radio-feature" type="button" @click="findIntent">
            <small>PRIVATE RADIO</small><strong>角色电台</strong><span>{{ intent.artist || '搜索此刻想听的声音' }}</span
            ><i class="fa-solid fa-headphones"></i>
          </button>
        </div>
        <div class="music-library-heading">
          <strong>{{ favoritesOnly ? '喜欢的歌' : '发现旋律' }}</strong
          ><small>{{ displayTracks.length }} 首</small>
        </div>
        <p v-if="music.busy" class="music-feedback" role="status">正在加载音源…</p>
        <p v-if="music.searchStatus || music.searching" class="music-feedback" role="status">
          {{ music.searchStatus || '正在搜索歌曲…' }}
        </p>
        <p v-if="music.error" class="music-feedback" role="alert">{{ music.error }}</p>
        <div class="music-results">
          <div
            v-for="track in displayTracks"
            :key="track.source + track.id"
            class="music-track-swipe"
            :class="{ deletable: favoritesOnly, revealed: revealedTrack === trackKey(track) }"
          >
            <button
              v-if="favoritesOnly"
              type="button"
              class="music-track-delete-action"
              :tabindex="revealedTrack === trackKey(track) ? 0 : -1"
              :aria-label="`删除歌曲：${track.title}`"
              @click="deleteTrack(track)"
            >
              删除
            </button>
            <article
              @click.capture="suppressTrackAction"
              @contextmenu.prevent="revealTrack(track)"
              @pointerdown="startTrackSwipe($event, track)"
              @pointerup="endTrackSwipe"
              @pointercancel="trackSwipe = null"
            >
              <img v-if="track.cover" :src="track.cover" alt="" /><span v-else class="music-cover-placeholder"
                ><i class="fa-solid fa-music"></i></span
              ><button type="button" :disabled="music.busy" @click="playTrack(track)">
                <strong>{{ track.title }}</strong
                ><small>{{ track.artist }} · {{ track.album }} · {{ musicSourceLabel(track.source) }}</small></button
              ><button
                type="button"
                aria-label="喜欢歌曲"
                :aria-pressed="isFavorite(track)"
                @click="favorite(track)"
              >
                <i :class="isFavorite(track) ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i></button
              ><button type="button" aria-label="加入歌单或播放队列" @click="collecting = track">
                <i class="fa-solid fa-plus"></i>
              </button>
            </article>
          </div>
        </div>
        <p v-if="!displayTracks.length && !music.busy && !music.searching" class="music-feedback">
          {{ favoritesOnly ? '搜索并收藏喜欢的歌曲，在这里重逢。' : '输入歌名或歌手，寻找新的旋律。' }}
        </p>
      </template>
    </template>
    <template v-else>
      <header class="music-player-top">
        <button type="button" aria-label="返回音乐主页" @click="music.view = 'home'">
          <i class="fa-solid fa-chevron-down"></i></button
        ><span
          ><small>NOW PLAYING</small><strong>{{ music.current?.album || '私人电台' }}</strong></span
        ><button type="button" aria-label="音乐设置" @click="$emit('settings')">
          <i class="fa-solid fa-sliders"></i>
        </button>
      </header>
      <WaveTogether />
      <div class="music-turntable">
        <div class="music-vinyl" :class="{ spinning: music.playing }">
          <img v-if="music.current?.cover" :src="music.current.cover" alt="专辑封面" /><i
            v-else
            class="fa-solid fa-music"
          ></i>
        </div>
        <svg class="music-needle" viewBox="0 0 72 260" aria-hidden="true">
          <defs>
            <linearGradient id="wave-needle-metal">
              <stop stop-color="#9da4b5" />
              <stop offset=".45" stop-color="#fff" />
              <stop offset="1" stop-color="#b4bcca" />
            </linearGradient>
          </defs>
          <rect x="39" y="1" width="19" height="27" rx="3" fill="url(#wave-needle-metal)" />
          <path
            d="M48 28V172Q48 193 35 209L23 225"
            fill="none"
            stroke="#929aaa"
            stroke-opacity=".18"
            stroke-width="9"
          />
          <path d="M46 28V170Q46 191 33 207L21 223" fill="none" stroke="url(#wave-needle-metal)" stroke-width="5" />
          <circle cx="46" cy="42" r="13" fill="#fff" stroke="#dce0e6" stroke-width="4" />
          <circle cx="46" cy="42" r="8" fill="#f8fafb" />
          <rect
            x="13"
            y="214"
            width="15"
            height="30"
            rx="7"
            transform="rotate(34 20 228)"
            fill="#f9faf8"
            stroke="#e3e5eb"
          />
          <path d="m13 244 -3 6" stroke="#8e98a9" stroke-width="2" />
        </svg>
      </div>
      <div class="music-track-heading">
        <div>
          <div class="music-track-title">{{ music.current?.title || intent.title || '等一首心动的歌' }}</div>
          <p>{{ music.current?.artist || intent.artist || '搜索喜欢的歌，开启私人电台' }}</p>
          <small>{{ music.current?.album }}</small>
        </div>
        <button
          v-if="music.current"
          type="button"
          aria-label="收藏歌曲"
          :aria-pressed="isFavorite(music.current)"
          @click="favorite(music.current)"
        >
          <i :class="isFavorite(music.current) ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i>
        </button>
      </div>
      <p v-if="music.busy" class="music-feedback" role="status">正在寻找旋律…</p>
      <p v-if="music.error" class="music-feedback" role="alert">{{ music.error }}</p>
      <button v-if="!followLyrics" class="lyrics-resume" type="button" @click="resumeLyrics">回到当前歌词</button>
      <div
        class="music-lyrics"
        aria-label="同步歌词"
        @wheel.passive="followLyrics = false"
        @touchstart.passive="followLyrics = false"
        @pointerdown="followLyrics = false"
      >
        <template v-if="music.lyrics.length"
          ><p
            v-for="(line, index) in music.lyrics"
            :key="`${line.time}-${index}`"
            :ref="el => setLine(el, index)"
            :class="{ active: index === music.lyricIndex }"
            @click="music.seek(line.time)"
          >
            {{ line.text }}
          </p></template
        >
        <p v-else>{{ music.current ? '暂无同步歌词' : '旋律会在这里留下回声' }}</p>
      </div>
      <div class="music-progress">
        <WaveSlider
          :model-value="music.time"
          :min="0"
          :max="music.duration || 1"
          :step="0.1"
          :disabled="!music.duration"
          aria-label="播放进度"
          @update:model-value="value => music.seek(value)"
        />
        <div>
          <span>{{ clock(music.time) }}</span
          ><span>{{ clock(music.duration) }}</span>
        </div>
      </div>
      <div class="music-controls">
        <button
          type="button"
          :aria-label="music.modeLabel + '，点击切换'"
          :title="music.modeLabel"
          @click="music.cycleMode()"
        >
          <i :class="music.modeIcon"></i><small class="music-mode-caption">{{ music.modeLabel }}</small></button
        ><button
          type="button"
          aria-label="上一首"
          :disabled="music.busy || !music.queue.length"
          @click="music.step(-1)"
        >
          <i class="fa-solid fa-backward-step"></i></button
        ><button
          class="music-play"
          type="button"
          :disabled="music.busy || !music.current"
          :aria-label="music.playing ? '暂停' : '播放'"
          @click="music.toggle()"
        >
          <i :class="music.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i></button
        ><button type="button" aria-label="下一首" :disabled="music.busy || !music.queue.length" @click="music.step(1)">
          <i class="fa-solid fa-forward-step"></i></button
        ><button type="button" aria-label="显示播放列表" @click="music.queueOpen = true">
          <i class="fa-solid fa-list-ul"></i>
        </button>
      </div>
    </template>
    <Teleport v-if="phoneSurface" :to="phoneSurface">
      <div v-if="collecting" class="music-sheet-backdrop" @click.self="collecting = null">
        <section class="music-library-sheet" role="dialog" aria-modal="true" :aria-label="'收藏歌曲'">
          <header>
            <strong>{{ '收藏 · ' + collecting.title }}</strong
            ><button type="button" aria-label="关闭" @click="collecting = null">×</button>
          </header>
          <template v-if="collecting">
            <button
              type="button"
              @click="
                music.enqueue(collecting, true);
                collecting = null;
              "
            >
              ＋ 加入播放队列
            </button>
            <button
              v-for="list in music.playlists"
              :key="list.id"
              type="button"
              @click="
                music.collect(list.id, collecting);
                collecting = null;
              "
            >
              收藏到 {{ list.name }}
            </button>
            <form @submit.prevent="createAndCollect">
              <input v-model="playlistName" maxlength="40" placeholder="新歌单名称" aria-label="新歌单名称" /><button
                :disabled="!playlistName.trim()"
              >
                新建并收藏
              </button>
            </form>
          </template>
        </section>
      </div>
    </Teleport>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch, nextTick, inject } from 'vue';
import { useMusicStore } from '../stores/music';
import { usePhoneStore } from '../stores/phone';
import { musicIntent, musicSourceLabel, type Track } from '../services/music';
import WaveSlider from './WaveSlider.vue';
import { phoneSurfaceKey } from '../services/ui-context';
const phoneSurface = inject(phoneSurfaceKey, ref(null));
import WavePlaylists from './WavePlaylists.vue';
const libraryTab = ref(false),
  playlistDetail = ref(false);
import WaveTogether from './WaveTogether.vue';
const props = defineProps<{ raw: string }>();
defineEmits<{ settings: [] }>();
const music = useMusicStore(),
  phone = usePhoneStore();
const collecting = ref<Track | null>(null),
  playlistName = ref('');
const favorite = music.favorite;
function createAndCollect() {
  music.createPlaylist(playlistName.value);
  const list = music.playlists.at(-1);
  if (list && collecting.value) music.collect(list.id, collecting.value);
  playlistName.value = '';
  collecting.value = null;
}
const query = ref(''),
  favoritesOnly = ref(false),
  followLyrics = ref(true);
const revealedTrack = ref('');
let trackSwipe: { x: number; y: number; key: string } | null = null;
let suppressTrackClickUntil = 0;
const intent = computed(() => musicIntent(props.raw));
const trackKey = (track: Track) => `${track.source}:${track.id}`;
const isFavorite = music.isFavorite;
const displayTracks = computed(() =>
  favoritesOnly.value
    ? (phone.state.musicCatalog[phone.state.activeCharKey] || []).filter(track =>
        (phone.state.musicFavorites[phone.state.activeCharKey] || []).includes(trackKey(track)),
      )
    : query.value.trim()
      ? music.tracks
      : music.recommendations.length
        ? music.recommendations
        : music.daily,
);
const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
function search() {
  favoritesOnly.value = false;
  libraryTab.value = false;
  void music.search(query.value);
}
function findIntent() {
  query.value = `${intent.value.title} ${intent.value.artist}`.trim();
  if (query.value) search();
}
function playTrack(track: Track) {
  if (revealedTrack.value === trackKey(track)) {
    revealedTrack.value = '';
    return;
  }
  music.view = 'player';
  followLyrics.value = true;
  void music.select(track);
}
function revealTrack(track: Track) {
  if (favoritesOnly.value) revealedTrack.value = trackKey(track);
}
function startTrackSwipe(event: PointerEvent, track: Track) {
  if (!favoritesOnly.value || event.button !== 0) return;
  trackSwipe = { x: event.clientX, y: event.clientY, key: trackKey(track) };
}
function endTrackSwipe(event: PointerEvent) {
  if (!trackSwipe) return;
  const dx = event.clientX - trackSwipe.x;
  const dy = event.clientY - trackSwipe.y;
  if (Math.abs(dx) > 42 && Math.abs(dy) < 35) {
    revealedTrack.value = dx < 0 ? trackSwipe.key : '';
    suppressTrackClickUntil = Date.now() + 400;
  }
  trackSwipe = null;
}
function suppressTrackAction(event: MouseEvent) {
  if (Date.now() >= suppressTrackClickUntil) return;
  event.preventDefault();
  event.stopPropagation();
}
function deleteTrack(track: Track) {
  music.deleteTrack(track);
  revealedTrack.value = '';
}
watch(
  () => [
    phone.settings.musicSource,
    phone.settings.neteaseApi,
    phone.settings.qqMusicApi,
    phone.settings.musicPersonalized,
  ],
  () => music.loadRecommendations(),
  { immediate: true },
);
const lines = new Map<number, HTMLElement>();
function setLine(el: any, index: number) {
  if (el) lines.set(index, el);
  else lines.delete(index);
}
async function scrollLyric() {
  await nextTick();
  if (!followLyrics.value) return;
  const el = lines.get(music.lyricIndex);
  if (el?.parentElement) {
    const parent = el.parentElement;
    const top =
      el.getBoundingClientRect().top -
      parent.getBoundingClientRect().top +
      parent.scrollTop -
      parent.clientHeight / 2 +
      el.clientHeight / 2;
    parent.scrollTo({ top, behavior: 'smooth' });
  }
}
function resumeLyrics() {
  followLyrics.value = true;
  void scrollLyric();
}
watch(
  () => music.lyricIndex,
  () => {
    void scrollLyric();
  },
);
watch(
  () => music.current?.id,
  () => {
    followLyrics.value = true;
  },
);
watch(
  () => music.view,
  () => {
    void scrollLyric();
  },
);
watch(favoritesOnly, () => (revealedTrack.value = ''));
</script>
