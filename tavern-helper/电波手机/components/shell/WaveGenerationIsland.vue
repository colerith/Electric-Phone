<template>
  <button
    class="wave-dynamic-island generation-island"
    type="button"
    :aria-label="`${label}生成中，点击中止`"
    @click="$emit('stop')"
  >
    <span class="generation-pulse" aria-hidden="true"><i></i><i></i><i></i></span>
    <span
      ><strong>{{ label }}生成中</strong><small>点击中止</small></span
    >
    <i class="fa-solid fa-stop generation-stop" aria-hidden="true"></i>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AppId } from '../../schemas';

type GenerationTarget = AppId | 'moments';
const labels: Record<GenerationTarget, string> = {
  status: '状态',
  messages: '消息',
  memo: '备忘',
  zone: '空间',
  wallet: '钱包',
  calendar: '日历',
  browse: '浏览',
  music: '音乐',
  moments: '朋友圈',
};
const props = defineProps<{ app: GenerationTarget }>();
const label = computed(() => labels[props.app]);
defineEmits<{ stop: [] }>();
</script>
