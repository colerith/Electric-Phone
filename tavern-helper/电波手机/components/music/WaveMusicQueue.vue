<template>
  <Teleport v-if="surface && music.queueOpen" :to="surface">
    <div class="music-queue-backdrop" @click.self="music.queueOpen = false" @keydown.esc="music.queueOpen = false">
      <section class="music-queue-sheet" role="dialog" aria-modal="true" aria-label="播放列表">
        <header>
          <strong
            >正在播放 <small>{{ music.queue.length }}</small></strong
          ><button type="button" aria-label="关闭播放列表" @click="music.queueOpen = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </header>
        <div class="queue-toolbar">
          <button type="button" :aria-expanded="modesOpen" @click="modesOpen = !modesOpen">
            <i :class="music.modeIcon"></i>{{ music.modeLabel }}<i class="fa-solid fa-chevron-down"></i></button
          ><button type="button" :disabled="!music.queue.length" aria-label="清空播放列表" @click="music.clearQueue()">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
        <div v-if="modesOpen" class="queue-modes">
          <button
            v-for="option in modes"
            :key="option.value"
            type="button"
            :aria-pressed="music.mode === option.value"
            @click="
              music.setMode(option.value);
              modesOpen = false;
            "
          >
            {{ option.label }}
          </button>
        </div>
        <div ref="listElement" class="queue-rows">
          <article
            v-for="(track, index) in music.queue"
            :key="track.source + track.id"
            class="queue-row"
            :class="{ current: music.isCurrent(track), dragging: dragged === index }"
            :data-index="index"
          >
            <button
              class="queue-song"
              type="button"
              :aria-current="music.isCurrent(track) ? 'true' : undefined"
              :disabled="music.busy"
              @click="music.select(track)"
            >
              <strong>{{ track.title }}</strong
              ><span> — {{ track.artist }}</span>
            </button>
            <i
              v-if="music.isCurrent(track)"
              class="fa-solid fa-chart-simple queue-current-icon"
              :class="{ playing: music.playing }"
            ></i>
            <button type="button" aria-label="移出队列" @click="music.removeQueue(index)">
              <i class="fa-solid fa-xmark"></i>
            </button>
            <button
              class="queue-drag"
              type="button"
              aria-label="拖动排序，方向键上下移动"
              @pointerdown="startDrag($event, index)"
              @pointermove="drag"
              @pointerup="finishDrag"
              @pointercancel="cancelDrag"
              @keydown.up.prevent="music.moveQueue(index, index - 1)"
              @keydown.down.prevent="music.moveQueue(index, index + 1)"
            >
              <i class="fa-solid fa-bars"></i>
            </button>
          </article>
          <p v-if="!music.queue.length" class="queue-empty">
            播放列表是空的<br /><small>从歌曲旁的入队按钮添加旋律</small>
          </p>
        </div>
        <small class="queue-hint"
          >拖动右侧手柄调整顺序 · {{ music.mode === 'sequence' ? '播完最后一首后停止' : music.modeLabel }}</small
        >
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { inject, ref, watch, nextTick } from 'vue';
import { useMusicStore } from '../../stores/music';
import { phoneSurfaceKey } from '../../services/core/ui-context';
import type { PlaybackMode } from '../../services/music/music-queue';
const music = useMusicStore(),
  surface = inject(phoneSurfaceKey, ref(null)),
  modesOpen = ref(false),
  listElement = ref<HTMLElement | null>(null),
  dragged = ref(-1);
const modes: { value: PlaybackMode; label: string }[] = [
  { value: 'sequence', label: '顺序播放' },
  { value: 'shuffle', label: '随机播放' },
  { value: 'loop', label: '列表循环' },
  { value: 'single', label: '单曲循环' },
];
let pointer = -1,
  origin = -1,
  target = -1;
function startDrag(event: PointerEvent, index: number) {
  if (event.button !== 0) return;
  pointer = event.pointerId;
  origin = index;
  target = index;
  dragged.value = index;
  (event.currentTarget as HTMLElement).setPointerCapture?.(pointer);
  event.preventDefault();
}
function drag(event: PointerEvent) {
  if (event.pointerId !== pointer || !listElement.value) return;
  const rows = [...listElement.value.querySelectorAll<HTMLElement>('.queue-row')];
  const hit = rows.findIndex(row => event.clientY < row.getBoundingClientRect().bottom);
  target = hit < 0 ? rows.length - 1 : hit;
  rows.forEach((row, index) => row.classList.toggle('drop-target', index === target && target !== origin));
  const rect = listElement.value.getBoundingClientRect();
  if (event.clientY > rect.bottom - 24) listElement.value.scrollTop += 12;
  if (event.clientY < rect.top + 24) listElement.value.scrollTop -= 12;
}
function cancelDrag() {
  pointer = -1;
  dragged.value = -1;
  listElement.value?.querySelectorAll('.drop-target').forEach(row => row.classList.remove('drop-target'));
}
function finishDrag(event: PointerEvent) {
  if (event.pointerId !== pointer) return;
  music.moveQueue(origin, target);
  cancelDrag();
}
watch(
  () => music.queueOpen,
  async open => {
    cancelDrag();
    modesOpen.value = false;
    if (!open) return;
    await nextTick();
    const list = listElement.value,
      row = list?.querySelector<HTMLElement>('.current');
    if (list && row)
      list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2;
  },
);
</script>
