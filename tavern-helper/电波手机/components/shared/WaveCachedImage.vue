<template>
  <img :src="display" :alt="alt" :data-source-src="src" decoding="async" @load="loaded" @error="failed" />
</template>
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { acquireImage, invalidateImage } from '../../services/core/image-cache';
const props = withDefaults(defineProps<{ src: string; alt?: string }>(), { alt: '' });
const emit = defineEmits<{ error: [event: Event]; load: [event: Event] }>();
const placeholder =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><g fill="none" stroke="#90a4c4" stroke-width="4"><rect x="17" y="17" width="46" height="46" rx="12"/><path d="m21 54 14-16 10 10 7-8 9 12"/><circle cx="49" cy="30" r="4"/></g></svg>',
  );
const display = ref(placeholder);
let epoch = 0,
  release: (() => void) | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  retries = 0;
async function load(source: string, token: number) {
  let held;
  try {
    held = await acquireImage(source);
  } catch {
    held = { src: source, release: () => {} };
  }
  if (token !== epoch) {
    held.release();
    return;
  }
  release?.();
  release = held.release;
  display.value = held.src || placeholder;
}
function loaded(event: Event) {
  if (display.value !== placeholder) emit('load', event);
}
function failed(event: Event) {
  if (display.value === placeholder) return;
  release?.();
  release = undefined;
  invalidateImage(props.src);
  display.value = placeholder;
  if (retries++ < 2) {
    const token = epoch;
    timer = setTimeout(() => void load(props.src, token), retries * 1000);
  } else emit('error', event);
}
watch(
  () => props.src,
  source => {
    epoch++;
    clearTimeout(timer);
    retries = 0;
    release?.();
    release = undefined;
    display.value = placeholder;
    void load(source, epoch);
  },
  { immediate: true },
);
onUnmounted(() => {
  epoch++;
  clearTimeout(timer);
  release?.();
});
</script>
