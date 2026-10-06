<template>
  <button
    class="wave-close-control"
    type="button"
    :aria-label="label"
    @pointerdown.stop
    @click.stop.prevent="emit('close')"
  >
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
  </button>
</template>
<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: '关闭' });
const emit = defineEmits<{ close: [] }>();
</script>
<style lang="scss">
#wave-phone-script-root .wave-device button.wave-close-control {
  position: relative !important;
  inset: auto !important;
  display: inline-grid !important;
  place-items: center !important;
  flex: 0 0 28px !important;
  width: 28px !important;
  height: 28px !important;
  min-height: 28px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 50% !important;
  background: #eaf0f8 !important;
  color: #6582ab !important;
  cursor: pointer;
  touch-action: manipulation;
  pointer-events: auto;
  &::before,
  &::after {
    content: none !important;
  }
  > svg {
    display: block !important;
    visibility: visible !important;
    position: static !important;
    width: 18px !important;
    height: 18px !important;
    margin: 0 !important;
    padding: 0 !important;
    pointer-events: none;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  &:focus-visible {
    outline: 2px solid #6582ab;
    outline-offset: 2px;
  }
}
</style>
