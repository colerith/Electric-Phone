<template>
  <div class="wave-poke-notice" :title="message.error || undefined">
    <span>{{ message.sender === 'user' ? '你' : actor }}</span
    ><span aria-hidden="true">👉🏻</span><span>戳了戳</span><span class="wave-poke-target">{{ target }}</span>
    <small v-if="message.status === 'failed'">未送达</small>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { PhoneMessage } from '../../schemas';
const props = defineProps<{ message: PhoneMessage; charName: string }>();
const actor = computed(() =>
  typeof props.message.payload.actorName === 'string' ? props.message.payload.actorName : props.charName,
);
const target = computed(() =>
  typeof props.message.payload.targetName === 'string'
    ? props.message.payload.targetName
    : props.message.content.match(/拍了拍(.+?)的头像/)?.[1] ||
      (props.message.sender === 'user' ? props.charName : '你'),
);
</script>
