<template>
  <section class="wave-app-content" :class="`app-${appId}`">
    <WaveStatusPanel v-if="appId === 'status'" :raw="raw" :name="name" :avatar="avatar" />
    <WaveMemoPanel v-else-if="appId === 'memo'" :raw="raw" @delete="(kind, id) => $emit('delete', 'memo', kind, id)" />
  </section>
</template>

<script setup lang="ts">
import WaveMemoPanel from '../apps/WaveMemoPanel.vue';
import WaveStatusPanel from '../apps/WaveStatusPanel.vue';
import type { AppId } from '../../schemas';
defineProps<{ appId: AppId; raw: string; name: string; avatar: string }>();
defineEmits<{ delete: [app: 'memo', kind: 'note' | 'doodle', id: string] }>();
</script>
