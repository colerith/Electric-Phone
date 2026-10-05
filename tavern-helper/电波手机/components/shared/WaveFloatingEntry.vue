<template>
  <div class="wave-floating-viewport">
    <button
      ref="entry"
      type="button"
      class="wave-floating-entry"
      aria-label="打开电波手机"
      title="电波手机 · 拖动调整位置"
      @click="phone.isOpen = true"
    >
      <img :src="floatingIcon" alt="" draggable="false" />
    </button>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { floatingIcon } from '../../assets/icons/floating-icon';
import { bindFloatingEntry } from '../../services/core/floating-entry';
const phone = usePhoneStore();
const entry = ref<HTMLButtonElement | null>(null);
let dispose: (() => void) | undefined;
onMounted(() => {
  if (entry.value)
    dispose = bindFloatingEntry(entry.value, phone.settings.appearance.floatingPosition, value => {
      phone.settings.appearance.floatingPosition = value;
      phone.saveSettings();
    });
});
onBeforeUnmount(() => dispose?.());
</script>
<style scoped>
#wave-phone-script-root .wave-floating-viewport {
  position: fixed;
  inset: 0;
  width: auto;
  height: auto;
  overflow: hidden;
  contain: strict;
  pointer-events: none;
}
#wave-phone-script-root .wave-floating-viewport > .wave-floating-entry {
  all: initial;
  box-sizing: border-box;
  position: absolute;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  min-width: 0;
  min-height: 0;
  padding: 3px;
  margin: 0;
  border: 0;
  background: transparent;
  border-radius: 50%;
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.18s ease;
}
#wave-phone-script-root .wave-floating-entry::before,
#wave-phone-script-root .wave-floating-entry::after {
  content: none;
}
#wave-phone-script-root .wave-floating-entry > img {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
  filter: drop-shadow(0 2px 2px #314b7733);
}
#wave-phone-script-root .wave-floating-entry.is-docked {
  opacity: 0.62;
}
#wave-phone-script-root .wave-floating-entry:hover,
#wave-phone-script-root .wave-floating-entry:focus,
#wave-phone-script-root .wave-floating-entry.is-dragging {
  opacity: 1;
}
#wave-phone-script-root .wave-floating-entry:focus-visible {
  outline: 2px solid #5e80be;
  outline-offset: -3px;
}
#wave-phone-script-root .wave-floating-entry.is-dragging {
  cursor: grabbing;
}
@media (prefers-reduced-motion: reduce) {
  #wave-phone-script-root .wave-floating-entry {
    transition: none;
  }
}
</style>
