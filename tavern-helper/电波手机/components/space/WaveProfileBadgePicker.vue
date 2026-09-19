<template>
  <fieldset class="space-badge-picker">
    <legend>
      个人徽章 <small>{{ modelValue.length }}/4</small>
    </legend>
    <div class="space-badge-selected">
      <button
        v-for="badge in selected"
        :key="badge.id"
        type="button"
        :aria-label="`移除${badge.label}徽章`"
        @click="toggle(badge.id)"
      >
        <img :src="badge.url" :alt="badge.label" /><span>×</span></button
      ><small v-if="!selected.length">选择最多 4 枚，表达你的兴趣与心情</small>
    </div>
    <div class="space-badge-categories" role="tablist" aria-label="徽章分类">
      <button
        v-for="item in badgeCategories"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="category === item.id"
        @click="category = item.id"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="space-badge-grid">
      <button
        v-for="badge in visible"
        :key="badge.id"
        type="button"
        :aria-pressed="modelValue.includes(badge.id)"
        :disabled="!modelValue.includes(badge.id) && modelValue.length >= 4"
        :aria-label="badge.label"
        @click="toggle(badge.id)"
      >
        <img :src="badge.url" alt="" /><span>{{ badge.label }}</span>
      </button>
    </div>
  </fieldset>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { badgeCategories, profileBadges } from '../../services/space/profile-badges';
const props = defineProps<{ modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const category = ref('mood');
const visible = computed(() => profileBadges.filter(badge => badge.category === category.value));
const selected = computed(() =>
  props.modelValue.map(id => profileBadges.find(badge => badge.id === id)).filter(badge => !!badge),
);
function toggle(id: string) {
  if (props.modelValue.includes(id))
    emit(
      'update:modelValue',
      props.modelValue.filter(item => item !== id),
    );
  else if (props.modelValue.length < 4) emit('update:modelValue', [...props.modelValue, id]);
}
</script>
