<template>
  <div class="wave-memo-panel">
    <div class="memo-toolbar">
      <label class="app-search memo-search"
        ><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i
        ><input v-model="query" aria-label="搜索备忘内容" placeholder="找一张便签…" /><button
          v-if="query"
          type="button"
          aria-label="清空搜索"
          @click="query = ''"
        >
          <i class="fa-solid fa-xmark"></i></button
      ></label>
      <div class="memo-filter-row">
        <div class="memo-filter" aria-label="备忘筛选">
          <button type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button
          ><button type="button" :aria-pressed="filter === 'notes'" @click="filter = 'notes'">便签</button
          ><button type="button" :aria-pressed="filter === 'doodle'" @click="filter = 'doodle'">涂鸦</button>
        </div>
        <small>{{ page.notes.length }} 张便签</small>
      </div>
    </div>
    <div v-if="visibleNotes.length" class="memo-paper-grid">
      <article
        v-for="note in visibleNotes"
        :key="note.index"
        class="memo-paper"
        :class="[{ expanded: expanded.has(note.index) }, `paper-${note.index % 3}`]"
      >
        <span class="memo-tape" aria-hidden="true"></span>
        <div class="memo-paper-meta">
          <span>NOTE / {{ String(note.index + 1).padStart(2, '0') }}</span
          ><i class="fa-solid fa-thumbtack" aria-hidden="true"></i
          ><button
            type="button"
            class="wave-content-delete"
            :aria-label="`删除备忘：${note.title}`"
            @click="$emit('delete', 'note', note.id)"
          >
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
        <strong class="memo-paper-title">{{ note.title }}</strong>
        <p :id="`wave-memo-note-${note.index}`" class="memo-paper-copy">{{ note.content || '这张便签还没有正文。' }}</p>
        <WaveModuleTranslation app="memo" :translation="note.translation" />
        <button
          type="button"
          class="memo-paper-toggle"
          :aria-expanded="expanded.has(note.index)"
          :aria-controls="`wave-memo-note-${note.index}`"
          @click="toggleNote(note.index)"
        >
          {{ expanded.has(note.index) ? '折起便签' : '展开阅读'
          }}<i :class="expanded.has(note.index) ? 'fa-solid fa-minus' : 'fa-solid fa-arrow-up-right-from-square'"></i>
        </button>
      </article>
    </div>
    <article v-for="doodle in visibleDoodles" :key="doodle.id" class="memo-doodle-ticket">
      <header class="memo-ticket-heading">
        <div>
          <small>DOODLE NOTE</small><strong>{{ doodle.title || '随性涂鸦' }}</strong>
        </div>
        <button
          type="button"
          class="wave-content-delete"
          :aria-label="`删除涂鸦：${doodle.title || '随性涂鸦'}`"
          @click="$emit('delete', 'doodle', doodle.id)"
        >
          <i class="fa-regular fa-trash-can"></i></button
        ><span class="memo-paperclip" aria-hidden="true"></span>
      </header>
      <div v-if="doodle.content" class="memo-doodle-sheet">
        <pre
          tabindex="0"
          aria-label="涂鸦原文，可横向滚动或拖动查看"
          @pointerdown="startDoodleDrag"
          @pointermove="moveDoodleDrag"
          @pointerup="endDoodleDrag"
          @pointercancel="endDoodleDrag"
          @lostpointercapture="endDoodleDrag"
          @dragstart.prevent
          >{{ doodle.content }}</pre
        >
      </div>
      <div v-if="doodle.interpretation" class="memo-interpretation">
        <span>涂鸦解析</span>
        <p>{{ doodle.interpretation }}</p>
      </div>
      <WaveModuleTranslation app="memo" :translation="doodle.translation" />
      <footer class="memo-ticket-footer">
        <span>留下一点不必说出口的心事</span><span class="memo-barcode" aria-hidden="true"></span>
      </footer>
    </article>
    <div v-if="!visibleNotes.length && !visibleDoodles.length" class="memo-empty">
      <i class="fa-regular fa-note-sticky" aria-hidden="true"></i
      ><strong>{{ query ? '没有找到这张便签' : filter === 'doodle' ? '还没有留下涂鸦' : '留一页给下一段故事' }}</strong>
      <p>{{ query ? '换一个词，再找找看。' : '笔记与涂鸦会随角色的新记录出现在这里。' }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import WaveModuleTranslation from './WaveModuleTranslation.vue';
import { parseMemoData } from '../services/memo';
const props = defineProps<{ raw: string }>();
defineEmits<{ delete: [kind: 'note' | 'doodle', id: string] }>();
const query = ref('');
const filter = ref<'all' | 'notes' | 'doodle'>('all');
const expanded = ref(new Set([0]));
const page = computed(() => parseMemoData(props.raw));
const search = computed(() => query.value.trim().toLocaleLowerCase());
const visibleNotes = computed(() =>
  filter.value === 'doodle'
    ? []
    : page.value.notes
        .map((note, index) => ({ ...note, index }))
        .filter(note => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(search.value)),
);
const visibleDoodles = computed(() =>
  filter.value === 'notes'
    ? []
    : page.value.doodles.filter(d =>
        `${d.title}\n${d.content}\n${d.interpretation}`.toLocaleLowerCase().includes(search.value),
      ),
);
let doodleDrag: { pointerId: number; startX: number; scrollLeft: number; target: HTMLElement } | undefined;
function startDoodleDrag(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;
  const target = event.currentTarget as HTMLElement;
  if (target.scrollWidth <= target.clientWidth) return;
  event.preventDefault();
  target.setPointerCapture?.(event.pointerId);
  target.classList.add('is-dragging');
  doodleDrag = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: target.scrollLeft, target };
}
function moveDoodleDrag(event: PointerEvent): void {
  if (!doodleDrag || doodleDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  doodleDrag.target.scrollLeft = doodleDrag.scrollLeft - (event.clientX - doodleDrag.startX);
}
function endDoodleDrag(event: PointerEvent): void {
  if (!doodleDrag || doodleDrag.pointerId !== event.pointerId) return;
  doodleDrag.target.classList.remove('is-dragging');
  if (doodleDrag.target.hasPointerCapture?.(event.pointerId))
    doodleDrag.target.releasePointerCapture?.(event.pointerId);
  doodleDrag = undefined;
}
function toggleNote(index: number): void {
  if (expanded.value.has(index)) expanded.value.delete(index);
  else expanded.value.add(index);
}
watch(
  () => props.raw,
  () => {
    expanded.value = new Set([0]);
  },
);
</script>
