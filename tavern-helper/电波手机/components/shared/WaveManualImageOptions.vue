<template>
  <div class="wave-manual-image-options">
    <div class="manual-image-toggle">
      <span>AI 生图</span
      ><WaveToggle
        :model-value="enabled"
        aria-label="AI 生图"
        @update:model-value="value => emit('update:enabled', value)"
      />
    </div>
    <template v-if="enabled">
      <label
        >生图接口<WaveSelect
          :model-value="profileId"
          :options="profiles"
          aria-label="本次生图接口"
          @update:model-value="value => emit('update:profileId', value)"
      /></label>
      <label class="manual-image-count"
        ><span
          >生成数量 <b>{{ count }} 张</b></span
        ><WaveSlider
          :model-value="count"
          :min="1"
          :max="max"
          aria-label="AI 生图数量"
          @update:model-value="value => emit('update:count', value)"
      /></label>
      <small>{{ video ? '按视频描述生成分镜图片。' : '按画面描述生成图片。' }}发送后逐张生成，可点开图片重试。</small>
      <small v-if="!profiles.length">请先在设置中配置生图接口。</small>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import WaveToggle from './WaveToggle.vue';
import WaveSelect from './WaveSelect.vue';
import WaveSlider from './WaveSlider.vue';
const props = withDefaults(
  defineProps<{ enabled: boolean; count: number; profileId: string; max?: number; video?: boolean }>(),
  { max: 9, video: false },
);
const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:count': [value: number];
  'update:profileId': [value: string];
}>();
const phone = usePhoneStore();
const profiles = computed(() =>
  phone.settings.imageServices.profiles.map(profile => ({ value: profile.id, label: profile.name })),
);
watch(
  () => [props.enabled, props.profileId, profiles.value] as const,
  () => {
    if (props.enabled && !profiles.value.some(profile => profile.value === props.profileId))
      emit('update:profileId', profiles.value[0]?.value || '');
  },
  { immediate: true },
);
watch(
  () => props.max,
  max => {
    if (props.count > max) emit('update:count', Math.max(1, max));
  },
);
</script>
<style lang="scss">
#wave-phone-script-root .wave-device .wave-manual-image-options {
  display: grid;
  gap: 9px;
  padding: 9px 11px;
  margin: 8px 0;
  border: 1px solid var(--settings-line, #dce3ee);
  border-radius: 13px;
  font-size: 11px;
  background: var(--settings-control, #f4f7fc);
  color: var(--settings-text, #374558);
  .manual-image-toggle,
  .manual-image-count > span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .manual-image-toggle {
    min-height: 24px;
    font-size: 11px;
    line-height: 1.4;
  }
  > label {
    display: grid;
    gap: 8px;
    font-size: 12px;
  }
  .manual-image-count b {
    color: var(--settings-accent, #5e80be);
  }
  > small {
    font-size: 11px;
    line-height: 1.6;
    color: var(--settings-muted, #7f8a9a);
  }
}
#wave-phone-script-root .wave-device .wave-manual-image-options .wave-toggle-control {
  width: 34px !important;
  min-width: 34px !important;
  max-width: 34px !important;
  height: 20px !important;
  min-height: 20px !important;
  max-height: 20px !important;
  align-self: center;
  > span {
    width: 16px !important;
    height: 16px !important;
    top: 2px;
    left: 2px;
  }
  &.active > span {
    transform: translateX(14px);
  }
}
</style>
