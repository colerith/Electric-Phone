<template>
  <section class="space-notifications">
    <template v-if="opened">
      <header class="space-notice-heading">
        <div>
          <strong>互动消息</strong><small class="space-notice-count">{{ unread.length }} 条未读</small>
        </div>
        <div class="space-notice-actions">
          <button type="button" :disabled="!unread.length" @click="markRead">全部已读</button
          ><button type="button" class="space-notice-clear" :disabled="!visible.length" @click="clear">清空</button>
        </div>
      </header>
      <div class="space-notice-filters" aria-label="消息筛选">
        <button
          v-for="option in filters"
          :key="option.key"
          type="button"
          :aria-pressed="filter === option.key"
          @click="filter = option.key"
        >
          {{ option.label }}
        </button>
      </div>
      <div class="space-notice-list">
        <p v-if="!filtered.length" class="messenger-empty">
          {{ filter === 'unread' ? '暂时没有未读消息' : '暂无这类互动消息' }}
        </p>
        <button v-for="item in filtered" :key="item.id" type="button" class="space-notice-row" @click="visit(item)">
          <span class="space-notice-avatar"
            ><img v-if="avatar(item)" :src="avatar(item)" alt="" /><i
              v-else
              class="fa-regular fa-user"
              aria-hidden="true"
            ></i
            ><b v-if="!isRead(item)"
          /></span>
          <span class="space-notice-body"
            ><span class="space-notice-person"
              ><strong>{{ nameFor(item) }}</strong
              ><time>{{ time(item) }}</time></span
            ><small v-if="item.source === 'hole'" class="space-notice-source">匿名树洞</small
            ><span class="space-notice-content"
              ><i v-if="item.kind === 'like'" class="fa-regular fa-heart" aria-hidden="true"></i
              >{{ item.content }}</span
            ></span
          >
          <span class="space-notice-preview"
            ><img v-if="item.thumbnail" :src="item.thumbnail" alt="原帖配图" loading="lazy" /><span v-else>{{
              item.excerpt
            }}</span></span
          >
        </button>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useNow } from '@vueuse/core';
import { usePhoneStore } from '../../stores/phone';
import { parseZonePage } from '../../services/space/zone';
import { displayIdentityName } from '../../services/core/identity';
import { npcAvatarUrl, spaceAvatarUrl } from '../../services/space/npc-avatar';
import { anonymousAvatarUrl } from '../../services/space/tree-hole';
import type { SpaceNotice } from '../../services/space/notifications';
defineProps<{ opened: boolean }>();
const emit = defineEmits<{ visit: [item: SpaceNotice] }>();
const phone = usePhoneStore(),
  now = useNow({ interval: 1000 });
const visible = computed(() =>
  phone.spaceNotificationItems
    .filter(
      item => item.availableAt <= now.value.getTime() && !phone.state.spaceNotifications.dismissed.includes(item.id),
    )
    .sort(
      (a, b) =>
        (phone.state.spaceNotifications.seen[b.id] || b.createdAt) -
        (phone.state.spaceNotifications.seen[a.id] || a.createdAt),
    ),
);
const read = computed(() => new Set(phone.state.spaceNotifications.read));
const isRead = (item: SpaceNotice) => read.value.has(item.id);
const unread = computed(() => visible.value.filter(item => !isRead(item)));
const filters = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'post', label: '新动态' },
  { key: 'comment', label: '评论回复' },
  { key: 'like', label: '点赞' },
];
const filter = ref('all');
const filtered = computed(() =>
  visible.value.filter(
    item => filter.value === 'all' || (filter.value === 'unread' ? !isRead(item) : item.kind === filter.value),
  ),
);
function clear() {
  phone.clearSpaceNotifications(visible.value.map(item => item.id));
}
function markRead() {
  phone.readSpaceNotifications(visible.value.map(item => item.id));
}
function visit(item: SpaceNotice) {
  phone.readSpaceNotifications([item.id]);
  emit('visit', item);
}
function nameFor(item: SpaceNotice) {
  if (item.source === 'hole') return item.actorName || '匿名访客';
  const identity = phone.state.identities[item.actorKey];
  return identity
    ? parseZonePage(phone.state.snapshots[item.actorKey]?.zone || '').profile.username || displayIdentityName(identity)
    : phone.state.moments.npcs[item.actorKey]?.username || item.actorName || '访客';
}
function avatar(item: SpaceNotice) {
  return item.source === 'hole'
    ? anonymousAvatarUrl(`${item.day}:${item.actorName}`)
    : phone.state.identities[item.actorKey]?.avatar ||
        (phone.state.moments.npcs[item.actorKey]
          ? npcAvatarUrl(phone.state.moments.npcs[item.actorKey].avatarSeed)
          : '') ||
        spaceAvatarUrl(`space-${item.actorKey || `guest:${item.actorName}`}`);
}
function time(item: SpaceNotice) {
  const minutes = Math.max(
    0,
    Math.floor((now.value.getTime() - (phone.state.spaceNotifications.seen[item.id] || item.createdAt)) / 60000),
  );
  return minutes < 1
    ? '刚刚'
    : minutes < 60
      ? `${minutes}分钟前`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}小时前`
        : `${Math.floor(minutes / 1440)}天前`;
}
</script>
<style scoped>
.space-notice-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 4px;
  font-size: 13px;
}
#wave-phone-script-root .space-app .space-notice-heading button {
  border: 0;
  background: transparent;
  color: var(--settings-accent, #6383bd);
  font-size: 11px;
}
#wave-phone-script-root .space-app .space-notice-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: 100%;
  padding: 17px 12px;
  border: 0;
  border-bottom: 1px solid #eef0f3;
  background: var(--wave-card, #fff);
  color: var(--settings-text, #41464f);
  text-align: left;
}
#wave-phone-script-root .space-app .space-notice-avatar {
  position: relative;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f1f3f7;
  display: grid;
  place-items: center;
  color: #8995a7;
}
#wave-phone-script-root .space-app .space-notice-avatar > img {
  display: block;
  width: 36px;
  height: 36px;
  min-width: 36px;
  max-width: 36px;
  min-height: 36px;
  max-height: 36px;
  aspect-ratio: 1;
  border-radius: 50%;
  clip-path: circle(50%);
  object-fit: cover;
}
.space-notice-avatar b {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e97785;
}
.space-notice-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}
.space-notice-person {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.space-notice-person strong {
  color: var(--settings-accent, #6383bd);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.space-notice-person time,
.space-notice-source {
  font-size: 10px;
  color: var(--settings-muted, #9297a0);
  white-space: nowrap;
}
.space-notice-content {
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.space-notice-content i {
  color: var(--settings-accent, #6383bd);
  margin-right: 6px;
}
.space-notice-preview {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 8px;
  background: #f4f5f7;
  color: var(--settings-muted, #9297a0);
  font-size: 10px;
  line-height: 1.7;
}
.space-notice-preview > span {
  display: block;
  padding: 3px 5px;
}
.space-notice-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.space-notice-heading > div {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.space-notice-heading > div:first-child {
  display: grid;
  gap: 5px;
}
.space-notice-count {
  color: #e56b94;
  font-size: 11px;
}
#wave-phone-script-root .space-app .space-notice-heading .space-notice-clear {
  color: #e56b94;
  font-weight: 600;
}
.space-notice-actions button:disabled {
  opacity: 0.45;
  cursor: default;
}
.space-notice-filters {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0 14px;
}
#wave-phone-script-root .space-app .space-notice-filters button {
  flex: 0 0 auto;
  padding: 7px 11px;
  border: 0;
  border-radius: 20px;
  font-size: 11px;
  background: var(--wave-card, #fff);
  color: var(--settings-muted, #9297a0);
}
#wave-phone-script-root .space-app .space-notice-filters button[aria-pressed='true'] {
  background: var(--settings-accent, #6383bd);
  color: white;
}
.space-notice-list {
  overflow: hidden;
  border-radius: 20px;
  background: var(--wave-card, #fff);
}
#wave-phone-script-root .space-app .space-notice-row:last-child {
  border-bottom: 0;
}
.space-notice-list .messenger-empty {
  padding: 32px 16px;
  text-align: center;
}
</style>
