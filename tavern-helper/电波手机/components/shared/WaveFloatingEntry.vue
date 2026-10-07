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
