<template>
  <aside class="music-bottom-dock" aria-label="迷你播放器">
    <button class="dock-track" type="button" aria-label="打开正在播放" @click="$emit('open')">
      <img v-if="music.current?.cover" :src="music.current.cover" alt="" /><span v-else class="dock-art">♫</span
      ><span
        ><strong>{{ music.current?.title }}</strong
        ><small>{{ music.current?.artist }}</small></span
      >
    </button>
    <button type="button" :disabled="music.busy" :aria-label="music.playing ? '暂停' : '播放'" @click="music.toggle()">
      <i :class="music.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
    </button>
    <button type="button" aria-label="播放列表" @click="music.queueOpen = true">
      <i class="fa-solid fa-list-ul"></i>
    </button>
    <span class="dock-progress" aria-hidden="true"
      ><i :style="{ width: `${music.duration ? (music.time / music.duration) * 100 : 0}%` }"></i
    ></span>
  </aside>
</template>
<script setup lang="ts">
import { useMusicStore } from '../../stores/music';
const music = useMusicStore();
defineEmits<{ open: [] }>();
</script>
