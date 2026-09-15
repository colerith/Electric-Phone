<template>
  <div
    class="wave-dynamic-island music-island-v2"
    :class="{ 'has-music': music.current, expanded: open }"
    @keydown.esc="open = false"
  >
    <button
      v-if="music.current"
      class="island-toggle"
      type="button"
      :aria-expanded="open"
      aria-label="展开或收起音乐"
      @click="open = !open"
    >
      <img v-if="music.current.cover" :src="music.current.cover" alt="" /><span v-else>♫</span
      ><span class="island-wave" :class="{ active: music.playing }"><b></b><b></b><b></b><b></b></span></button
    ><i v-else></i>
    <template v-if="music.current && open">
      <button
        class="island-track"
        type="button"
        aria-label="打开音乐播放页"
        @click="
          $emit('open');
          open = false;
        "
      >
        <img v-if="music.current.cover" :src="music.current.cover" alt="专辑封面" /><span v-else class="island-art"
          >♫</span
        ><span class="island-copy"
          ><span
            ref="marqueeBox"
            class="island-marquee"
            :class="{ 'is-overflowing': overflow > 1 }"
            :style="{
              '--marquee-distance': `${-overflow}px`,
              '--marquee-duration': `${Math.max(8, overflow / 22 + 4)}s`,
            }"
            ><strong ref="marqueeText" :key="music.current.id"
              >{{ music.current.title }} — {{ music.current.artist }}</strong
            ></span
          ><small>{{
            music.lyrics[music.lyricIndex]?.text || (music.playing ? '旋律正在流动' : '已暂停')
          }}</small></span
        >
      </button>
      <div class="island-progress">
        <span>{{ clock(music.time) }}</span
        ><WaveSlider
          :model-value="music.time"
          :min="0"
          :max="music.duration || 1"
          :step="0.1"
          :disabled="!music.duration"
          aria-label="音乐播放进度"
          @update:model-value="music.seek"
        /><span>−{{ clock(Math.max(0, music.duration - music.time)) }}</span>
      </div>
      <div class="island-playback">
        <button type="button" aria-label="上一首" :disabled="music.busy || !music.queue.length" @click="music.step(-1)">
          <i class="fa-solid fa-backward-step"></i></button
        ><button
          class="island-main-play"
          type="button"
          :disabled="music.busy"
          :aria-label="music.playing ? '暂停' : '播放'"
          @click="music.toggle()"
        >
          <i :class="music.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i></button
        ><button type="button" aria-label="下一首" :disabled="music.busy || !music.queue.length" @click="music.step(1)">
          <i class="fa-solid fa-forward-step"></i>
        </button>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useMusicStore } from '../stores/music';
import WaveSlider from './WaveSlider.vue';
const music = useMusicStore(),
  open = ref(false);
const marqueeBox = ref<HTMLElement | null>(null),
  marqueeText = ref<HTMLElement | null>(null),
  overflow = ref(0);
let observer: ResizeObserver | undefined;
const measure = () => {
  overflow.value = Math.max(0, (marqueeText.value?.scrollWidth || 0) - (marqueeBox.value?.clientWidth || 0));
};
watch(
  [open, () => music.current?.title, () => music.current?.artist],
  async () => {
    overflow.value = 0;
    observer?.disconnect();
    await nextTick();
    measure();
    if (marqueeBox.value && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(marqueeBox.value);
      if (marqueeText.value) observer.observe(marqueeText.value);
    }
  },
  { flush: 'post' },
);
onBeforeUnmount(() => observer?.disconnect());
defineEmits<{ open: [] }>();
const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
watch(
  () => music.current,
  track => {
    if (!track) open.value = false;
  },
);
</script>
