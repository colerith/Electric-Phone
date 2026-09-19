<template>
  <button
    class="wave-toggle-control"
    type="button"
    role="switch"
    :aria-label="ariaLabel"
    :aria-checked="modelValue"
    :class="{ active: modelValue }"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span aria-hidden="true"></span>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; ariaLabel?: string }>(), { ariaLabel: '切换选项' });
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>
