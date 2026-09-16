<template>
  <section class="playlist-browser" :class="{ 'is-detail': selected }">
    <template v-if="!selected">
      <form
        class="playlist-create"
        @submit.prevent="
          music.createPlaylist(name);
          name = '';
        "
      >
        <input v-model="name" maxlength="80" aria-label="新歌单名称" placeholder="创建新歌单" /><button
          :disabled="!name.trim()"
        >
          ＋ 创建
        </button>
      </form>
      <article
        v-for="list in music.playlists"
        :key="list.id"
        class="playlist-row"
        @contextmenu.prevent="deleting = list.id"
        @touchstart.passive="touch = [$event.touches[0].clientX, $event.touches[0].clientY]"
        @touchend.passive="swipe($event, list.id)"
      >
        <button class="playlist-open" type="button" @click="openPlaylist(list.id)">
          <img v-if="cover(list)" :src="cover(list)" alt="" /><span v-else class="playlist-art">♫</span
          ><span
            ><strong>{{ list.name }}</strong
            ><small>{{ list.tracks.length }} 首歌曲</small></span
          >
        </button>
        <button
          v-if="deleting === list.id"
          type="button"
          class="playlist-delete"
          @click="
            music.deletePlaylist(list.id);
            deleting = '';
          "
        >
          删除
        </button>
        <button v-else type="button" aria-label="歌单选项" @click="deleting = list.id">⋯</button>
      </article>
      <p v-if="!music.playlists.length">给喜欢的旋律一个名字，创建你的第一张歌单。</p>
    </template>
    <template v-else>
      <div class="playlist-hero">
        <header>
          <button
            type="button"
            aria-label="返回歌单"
            @click="
              selectedId = '';
              editing = false;
            "
          >
            <i class="fa-solid fa-chevron-left"></i></button
          ><button
            type="button"
            aria-label="编辑歌单"
            @click="
              editName = selected.name;
              editCover = selected.cover;
              editing = true;
            "
          >
            <i class="fa-solid fa-ellipsis"></i>
          </button>
        </header>
        <strong>{{ selected.name }}</strong
        ><small>{{ selected.tracks.length }} 首 · 我的音乐收藏</small>
        <button type="button" :disabled="!selected.tracks.length" @click="music.playPlaylist(selected.id)">
          <i class="fa-solid fa-play"></i><span>播放全部</span>
        </button>
      </div>
      <div v-if="editing" class="playlist-edit">
        <label>歌单名称<input v-model="editName" maxlength="80" /></label>
        <WaveImageUpload
          purpose="artwork"
          :model-value="editCover"
          label="歌单封面"
          @confirm="value => (editCover = value.avatar)"
          @reset="editCover = ''"
        />
        <button
          type="button"
          :disabled="!editName.trim()"
          @click="
            music.editPlaylist(selected.id, editName, editCover);
            editing = false;
          "
        >
          保存歌单</button
        ><button type="button" @click="editing = false">取消</button>
      </div>
      <div
        v-for="(track, index) in selected.tracks"
        :key="track.source + track.id"
        class="playlist-song-swipe"
        :class="{ revealed: removingTrack === trackKey(track) }"
      >
        <button
          type="button"
          class="playlist-song-remove"
          :tabindex="removingTrack === trackKey(track) ? 0 : -1"
          :aria-label="`从歌单移出：${track.title}`"
          @click="removeTrack(track)"
        >
          移出歌单
        </button>
        <article
          class="playlist-song"
          @click.capture="suppressSongAction"
          @contextmenu.prevent="removingTrack = trackKey(track)"
          @pointerdown="startSongSwipe($event, track)"
          @pointerup="endSongSwipe"
          @pointercancel="songSwipe = null"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span
          ><button type="button" @click="playSong(track)">
            <strong>{{ track.title }}</strong
            ><small>{{ track.artist }}</small></button
          ><button
            type="button"
            aria-label="喜欢歌曲"
            :aria-pressed="music.isFavorite(track)"
            @click="music.favorite(track)"
          >
            <i :class="music.isFavorite(track) ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i></button
          ><button type="button" aria-label="加入播放队列" @click="music.enqueue(track, true)">
            <i class="fa-solid fa-list-ul"></i><sup>＋</sup>
          </button>
        </article>
      </div>
      <p v-if="!selected.tracks.length">从歌曲旁的 ＋ 添加到这张歌单。</p>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useMusicStore } from '../stores/music';
import type { Track } from '../services/music';
import WaveImageUpload from './WaveImageUpload.vue';
const music = useMusicStore();
const emit = defineEmits<{ detail: [value: boolean] }>();
const name = ref(''),
  selectedId = ref(''),
  deleting = ref(''),
  editing = ref(false),
  editName = ref(''),
  editCover = ref(''),
  removingTrack = ref('');
const touch = ref([0, 0]);
let suppressClickUntil = 0;
let songSwipe: { x: number; y: number; key: string } | null = null;
let suppressSongClickUntil = 0;
const trackKey = (track: Track) => `${track.source}:${track.id}`;
function openPlaylist(id: string) {
  if (Date.now() < suppressClickUntil) return;
  selectedId.value = id;
  deleting.value = '';
}
const selected = computed(() => music.playlists.find(list => list.id === selectedId.value));
watch(selected, value => {
  removingTrack.value = '';
  emit('detail', Boolean(value));
});
onBeforeUnmount(() => emit('detail', false));
const cover = (list: (typeof music.playlists)[number]) =>
  list.cover || list.tracks.find(track => track.cover)?.cover || '';
watch(
  () => [selected.value?.id, selected.value ? cover(selected.value) : ''],
  () => {
    music.playlistOpen = Boolean(selected.value);
    music.playlistCover = selected.value ? cover(selected.value) : '';
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  music.playlistOpen = false;
  music.playlistCover = '';
});
function swipe(event: TouchEvent, id: string) {
  const end = event.changedTouches[0];
  if (end.clientX - touch.value[0] < -45 && Math.abs(end.clientY - touch.value[1]) < 35) {
    deleting.value = id;
    suppressClickUntil = Date.now() + 400;
  }
}
function playSong(track: Track) {
  if (removingTrack.value === trackKey(track)) {
    removingTrack.value = '';
    return;
  }
  void music.select(track);
  music.view = 'player';
}
function startSongSwipe(event: PointerEvent, track: Track) {
  if (event.button !== 0) return;
  songSwipe = { x: event.clientX, y: event.clientY, key: trackKey(track) };
}
function endSongSwipe(event: PointerEvent) {
  if (!songSwipe) return;
  const dx = event.clientX - songSwipe.x;
  const dy = event.clientY - songSwipe.y;
  if (Math.abs(dx) > 42 && Math.abs(dy) < 35) {
    removingTrack.value = dx < 0 ? songSwipe.key : '';
    suppressSongClickUntil = Date.now() + 400;
  }
  songSwipe = null;
}
function suppressSongAction(event: MouseEvent) {
  if (Date.now() >= suppressSongClickUntil) return;
  event.preventDefault();
  event.stopPropagation();
}
function removeTrack(track: Track) {
  if (!selected.value) return;
  music.removeFromPlaylist(selected.value.id, track);
  removingTrack.value = '';
}
</script>
