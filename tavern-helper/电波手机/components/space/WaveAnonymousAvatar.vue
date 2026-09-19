<template>
  <span class="space-anonymous-avatar"
    ><img v-if="!failed" :src="url" alt="匿名头像" referrerpolicy="no-referrer" @error="failed = true" /><i
      v-else
      class="fa-solid fa-robot"
      aria-label="匿名头像"
    ></i
  ></span>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { anonymousAvatarUrl } from '../../services/space/tree-hole';
const props = defineProps<{ seed: string }>();
const url = computed(() => anonymousAvatarUrl(props.seed));
const failed = ref(false);
watch(url, () => {
  failed.value = false;
});
</script>
