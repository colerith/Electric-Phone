<template>
  <section class="space-notifications">
    <button v-if="!opened" type="button" class="space-notice-entry" @click="open">
      <span class="space-notice-icon"
        ><i class="fa-regular fa-comment-dots" aria-hidden="true"></i
        ><b v-if="unread.length">{{ unread.length > 99 ? '99+' : unread.length }}</b></span
      >
      <span class="space-notice-summary"
        ><strong>{{ unread.length ? `${unread.length} 条新消息` : '互动消息' }}</strong
        ><small>{{ phone.moduleGenerating || phone.zoneGenerating ? '正在等待新的回应…' : latestLabel }}</small></span
      >
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
    <template v-else>
      <header class="space-notice-heading">
        <span>全部互动消息</span><button type="button" @click="markRead">全部已读</button>
      </header>
      <p v-if="!visible.length" class="messenger-empty">还没有互动消息</p>
      <button v-for="item in visible" :key="item.id" type="button" class="space-notice-row" @click="visit(item)">
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
            ><strong>{{ item.actorName || '匿名访客' }}</strong
            ><time>{{ time(item) }}</time></span
          ><small v-if="item.source === 'hole'" class="space-notice-source">匿名树洞</small
          ><span class="space-notice-content"
            ><i v-if="item.kind === 'like'" class="fa-regular fa-heart" aria-hidden="true"></i>{{ item.content }}</span
          ></span
        >
        <span class="space-notice-preview"
          ><img v-if="item.thumbnail" :src="item.thumbnail" alt="原帖配图" loading="lazy" /><span v-else>{{
            item.excerpt
          }}</span></span
        >
      </button>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useNow } from '@vueuse/core';
import { usePhoneStore } from '../../stores/phone';
import { anonymousAvatarUrl } from '../../services/space/tree-hole';
import type { SpaceNotice } from '../../services/space/notifications';
defineProps<{ opened: boolean }>();
const emit = defineEmits<{ open: []; visit: [item: SpaceNotice] }>();
const phone = usePhoneStore(),
  now = useNow({ interval: 1000 });
const visible = computed(() =>
  phone.spaceNotificationItems
    .filter(item => item.availableAt <= now.value.getTime())
    .sort(
      (a, b) =>
        (phone.state.spaceNotifications.seen[b.id] || b.createdAt) -
        (phone.state.spaceNotifications.seen[a.id] || a.createdAt),
    ),
);
const read = computed(() => new Set(phone.state.spaceNotifications.read));
const isRead = (item: SpaceNotice) => read.value.has(item.id);
const unread = computed(() => visible.value.filter(item => !isRead(item)));
const latestLabel = computed(() =>
  unread.value.length
    ? `${unread.value[0].actorName} · ${unread.value[0].kind === 'post' ? '发布了新动态' : unread.value[0].kind === 'like' ? '赞了你的动态' : '有新的评论或回复'}`
    : '新动态、评论回复与点赞',
);
function markRead() {
  phone.readSpaceNotifications(visible.value.map(item => item.id));
}
function open() {
  emit('open');
  markRead();
}
function visit(item: SpaceNotice) {
  phone.readSpaceNotifications([item.id]);
  emit('visit', item);
}
function avatar(item: SpaceNotice) {
  return item.source === 'hole'
    ? anonymousAvatarUrl(`${item.day}:${item.actorName}`)
    : phone.state.identities[item.actorKey]?.avatar || '';
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
#wave-phone-script-root .space-app .space-notice-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  margin: 4px 0 16px;
  border: 0;
  border-radius: 18px;
  background: var(--wave-card, #fff);
  color: var(--settings-text, #41464f);
  text-align: left;
}
.space-notice-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: #edf2fa;
  color: var(--settings-accent, #6383bd);
  font-size: 18px;
}
.space-notice-icon b {
  position: absolute;
  top: -5px;
  right: -7px;
  padding: 2px 5px;
  min-width: 14px;
  border-radius: 12px;
  background: #e97785;
  color: white;
  font-size: 10px;
  text-align: center;
}
.space-notice-summary {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 4px;
}
.space-notice-summary strong {
  font-size: 13px;
  font-weight: 600;
}
.space-notice-summary small {
  font-size: 11px;
  color: var(--settings-muted, #9297a0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.space-notice-entry > i {
  font-size: 11px;
  color: var(--settings-muted, #9297a0);
}
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
.space-notice-avatar {
  position: relative;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #f1f3f7;
  display: grid;
  place-items: center;
  color: #8995a7;
}
.space-notice-avatar img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
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
</style>
