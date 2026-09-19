<template>
  <div class="wave-slider" :style="{ '--wave-slider-progress': `${progress}%` }">
    <span class="wave-slider-track" aria-hidden="true"><i></i><b></b></span>
    <input
      :value="modelValue"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @input="updateValue"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    ariaLabel?: string;
    disabled?: boolean;
  }>(),
  { step: 1, ariaLabel: '调整数值', disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const progress = computed(() => {
  if (props.max === props.min) return 50;
  return _.clamp(((props.modelValue - props.min) / (props.max - props.min)) * 100, 0, 100);
});

function updateValue(event: Event): void {
  emit('update:modelValue', Number((event.target as HTMLInputElement).value));
}
</script>
