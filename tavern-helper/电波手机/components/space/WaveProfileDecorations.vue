<template>
  <div v-if="title || selected.length" class="space-decorations" aria-label="称号与徽章">
    <span
      v-if="title"
      class="space-title-badge"
      :title="title"
      :style="{ backgroundColor: color, color: titleTextColor(color) }"
      >{{ title }}</span
    >
    <img
      v-for="badge in selected"
      :key="badge.id"
      :src="badge.url"
      :alt="badge.label"
      :title="badge.label"
      class="space-profile-badge"
    />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { profileBadges, ProfileTitleColorSchema, titleTextColor } from '../../services/space/profile-badges';
const props = withDefaults(defineProps<{ title?: string; titleColor?: string; badges?: string[] }>(), {
  title: '',
  titleColor: '#ea91a4',
  badges: () => [],
});
const selected = computed(() =>
  props.badges
    .slice(0, 4)
    .map(id => profileBadges.find(badge => badge.id === id))
    .filter(badge => !!badge),
);
const color = computed(() => ProfileTitleColorSchema.parse(props.titleColor));
</script>
