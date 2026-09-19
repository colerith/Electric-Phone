<template>
  <section class="message-reaction-picker" aria-label="选择消息反应">
    <div class="reaction-quick-row">
      <button
        v-for="emoji in shortcuts"
        :key="emoji"
        type="button"
        :aria-label="`反应 ${emoji}`"
        :aria-pressed="selected.includes(emoji)"
        :disabled="disabled(emoji)"
        @click="$emit('select', emoji)"
      >
        {{ emoji }}
      </button>
      <button type="button" aria-label="更多反应表情" :aria-expanded="expanded" @click="expanded = !expanded">
        <i :class="expanded ? 'fa-solid fa-chevron-up' : 'fa-regular fa-face-smile'"></i
        ><small v-if="!expanded">+</small>
      </button>
    </div>
    <div v-if="expanded" class="reaction-expanded">
      <template v-if="recent.length">
        <div class="reaction-section-label">最近使用</div>
        <div class="reaction-emoji-grid">
          <button
            v-for="emoji in recent"
            :key="emoji"
            type="button"
            :aria-label="`反应 ${emoji}`"
            :aria-pressed="selected.includes(emoji)"
            :disabled="disabled(emoji)"
            @click="$emit('select', emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </template>
      <div class="reaction-section-label">
        全部表情 <small v-if="selected.length >= reactionLimit">最多贴 {{ reactionLimit }} 个，点击已选可取消</small>
      </div>
      <nav class="reaction-categories" aria-label="反应表情分类">
        <button
          v-for="group in categories"
          :key="group.id"
          type="button"
          :aria-pressed="category === group.id"
          @click="category = group.id"
        >
          {{ group.label }}
        </button>
      </nav>
      <div :key="category" class="reaction-emoji-grid">
        <button
          v-for="emoji in choices"
          :key="emoji"
          type="button"
          :aria-label="`反应 ${emoji}`"
          :aria-pressed="selected.includes(emoji)"
          :disabled="disabled(emoji)"
          @click="$emit('select', emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import emojiData from '@emoji-mart/data/sets/15/native.json';
import { quickReactions, reactionLimit } from '../../services/chat/message-reactions';
const props = defineProps<{ selected: string[]; recent: string[] }>();
defineEmits<{ select: [emoji: string] }>();
const expanded = ref(false);
const category = ref('people');
const labels: Record<string, string> = {
  people: '表情',
  nature: '自然',
  foods: '美食',
  activity: '活动',
  places: '旅行',
  objects: '物品',
  symbols: '符号',
  flags: '旗帜',
};
const categories = emojiData.categories.map(group => ({ ...group, label: labels[group.id] || group.id }));
const shortcuts = computed(() => [...new Set([...props.recent, ...quickReactions])].slice(0, 6));
const choices = computed(() =>
  (categories.find(group => group.id === category.value)?.emojis || []).map(id => emojiData.emojis[id].skins[0].native),
);
function disabled(emoji: string) {
  return props.selected.length >= reactionLimit && !props.selected.includes(emoji);
}
</script>
