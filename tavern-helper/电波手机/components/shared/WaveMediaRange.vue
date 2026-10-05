<template>
  <div class="wave-media-range">
    <div v-if="override" class="media-range-heading">
      <span>单独设置每轮{{ noun }}数量</span
      ><WaveToggle
        :model-value="modelValue !== null"
        :aria-label="`单独设置${noun}数量`"
        @update:model-value="value => emit('update:modelValue', value ? { ...fallback } : null)"
      />
    </div>
    <template v-if="!override || modelValue !== null">
      <label v-for="bound in ['min', 'max'] as const" :key="bound"
        ><span
          >每轮{{ bound === 'min' ? '最少' : '最多' }}{{ noun }}数量 <b>{{ effective[bound] }} {{ unit }}</b></span
        ><WaveSlider
          :model-value="effective[bound]"
          :min="0"
          :max="15"
          :step="1"
          :aria-label="`每轮${bound === 'min' ? '最少' : '最多'}${noun}数量`"
          @update:model-value="value => change(bound, value)"
      /></label>
    </template>
    <p>
      {{
        override && modelValue === null
          ? `跟随全局：${fallback.min}–${fallback.max} ${unit}。`
          : '下限为 0 表示按情境选择；上限为 0 表示不生成。'
      }}数量计入每轮回复总数；若下限合计超出总上限，先保留语音下限，再缩减生图下限。服务未启用时为 0。
    </p>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { MediaRange } from '../../services/chat/media-settings';
import WaveToggle from './WaveToggle.vue';
import WaveSlider from './WaveSlider.vue';
const props = withDefaults(
  defineProps<{
    modelValue: MediaRange | null;
    fallback: MediaRange;
    noun: string;
    unit: string;
    override?: boolean;
  }>(),
  { override: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: MediaRange | null] }>();
const effective = computed(() => props.modelValue || props.fallback);
function change(bound: 'min' | 'max', value: number) {
  const next = { ...effective.value, [bound]: Math.max(0, Math.min(15, Math.round(value))) };
  if (bound === 'min') next.max = Math.max(next.min, next.max);
  else next.min = Math.min(next.min, next.max);
  emit('update:modelValue', next);
}
</script>
<style scoped lang="scss">
#wave-phone-script-root .wave-media-range {
  display: grid;
  gap: 18px;
  min-width: 0;
  font-weight: 400;
  .media-range-heading,
  label > span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-weight: 400;
  }
  label {
    display: grid;
    gap: 16px;
    margin: 0;
    font-weight: 400;
  }
  label + label {
    border-top: 1px solid #8882;
    padding-top: 18px;
  }
  b {
    font-weight: 500;
    color: var(--wave-blue, #5e80be);
    white-space: nowrap;
  }
  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    opacity: 0.65;
    font-weight: 400;
  }
}
</style>
