<template>
  <section class="space-hole">
    <WaveNpcProfile
      v-if="viewingPerson"
      npc-id=""
      anonymous
      :fallback-name="viewingPerson.name"
      :fallback-avatar="viewingPerson.avatar"
      @close="viewingPerson = null"
    />
    <WaveDeleteConfirm v-if="deleting" title="删除这条匿名动态？" @cancel="deleting = null" @confirm="confirmDelete" />
    <header class="space-hole-topic">
      <small>每日树洞 · {{ day }}</small>
      <h2>{{ topic }}</h2>
      <p>藏起名字，说说心里话。</p>
      <button type="button" :disabled="phone.zoneGenerating" @click="refresh">
        {{ phone.zoneGenerating ? '回声正在路上…' : '听听大家的声音' }}
      </button>
    </header>
    <form class="space-hole-compose" @submit.prevent="publish">
      <textarea
        v-model="draft"
        rows="3"
        maxlength="2000"
        placeholder="以匿名的身份，写点什么…"
        aria-label="匿名动态内容"
      ></textarea
      ><button type="submit" :disabled="!draft.trim()">匿名发布</button>
    </form>
    <p v-if="error" class="zone-error" role="status">{{ error }}</p>
    <article v-for="post in posts" :key="post.id" class="space-hole-post">
      <header class="space-post-header">
        <WaveAnonymousAvatar :seed="post.mine ? anonymousProfile.anonymousAvatarSeed : `${day}:${post.id}`" />
        <div class="space-post-author-details">
          <button
            type="button"
            class="moment-person-link"
            @click="
              showPerson(
                post.mine ? anonymousProfile.anonymousId : post.alias,
                post.mine ? anonymousProfile.anonymousAvatarSeed : `${day}:${post.id}`,
              )
            "
          >
            {{ post.mine ? anonymousProfile.anonymousId : post.alias }}
          </button>
        </div>
      </header>
      <p class="space-hole-copy">{{ post.content }}</p>
      <WaveModuleTranslation app="zone" :translation="post.translation" inline />
      <div class="space-hole-actions">
        <time>{{ time(post.createdAt) }}</time>
        <button type="button" :aria-pressed="post.liked" @click="phone.likeTreeHole(day, post.id)">
          <i :class="post.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i> 共鸣</button
        ><button type="button" @click="commenting = commenting === post.id ? '' : post.id">
          <i class="fa-solid fa-comment"></i> {{ post.comments.length }} 条回应</button
        ><button
          type="button"
          class="wave-content-delete"
          aria-label="删除匿名动态"
          @click="deleting = { day, id: post.id }"
        >
          <i class="fa-regular fa-trash-can"></i> 删除
        </button>
      </div>
      <div v-for="comment in post.comments" :key="comment.id" class="space-comment">
        <WaveAnonymousAvatar :seed="isMine(comment) ? anonymousProfile.anonymousAvatarSeed : `${day}:${comment.id}`" />
        <div class="space-comment-main">
          <header>
            <button
              type="button"
              class="moment-person-link"
              @click="
                showPerson(
                  isMine(comment) ? anonymousProfile.anonymousId : comment.alias,
                  isMine(comment) ? anonymousProfile.anonymousAvatarSeed : `${day}:${comment.id}`,
                )
              "
            >
              {{ isMine(comment) ? anonymousProfile.anonymousId : comment.alias }}</button
            ><time>{{ time(comment.createdAt) }}</time>
          </header>
          <p>
            <button
              v-if="comment.replyTo"
              type="button"
              class="space-mention moment-person-link"
              @click="showPerson(comment.replyTo, `${day}:${comment.replyTo}`)"
            >
              @{{ comment.replyTo }}</button
            >{{ comment.content }}
          </p>
          <WaveModuleTranslation app="zone" :translation="comment.translation" inline />
          <button
            type="button"
            class="moment-reply-action"
            @click="
              commenting = post.id;
              replyTo = isMine(comment) ? anonymousProfile.anonymousId : comment.alias;
            "
          >
            回复
          </button>
        </div>
      </div>
      <form v-if="commenting === post.id" class="moment-comment-form" @submit.prevent="sendComment(post.id)">
        <button v-if="replyTo" type="button" @click="replyTo = ''">回复 {{ replyTo }} ×</button
        ><input v-model="reply" maxlength="500" placeholder="匿名回应…" aria-label="匿名评论" /><button
          type="submit"
          :disabled="!reply.trim()"
        >
          发送
        </button>
      </form>
    </article>
    <p v-if="!posts.length" class="messenger-empty">今天的树洞还很安静，留下第一句回声吧。</p>
  </section>
</template>
<script setup lang="ts">
import WaveAnonymousAvatar from './WaveAnonymousAvatar.vue';
import WaveNpcProfile from './WaveNpcProfile.vue';
import { anonymousAvatarUrl, dailyTopic, treeHoleDay } from '../../services/space/tree-hole';
import WaveDeleteConfirm from '../shared/WaveDeleteConfirm.vue';
const viewingPerson = ref<{ name: string; avatar: string } | null>(null);
function showPerson(name: string, seed: string): void {
  viewingPerson.value = { name, avatar: anonymousAvatarUrl(seed) };
}
function back(): boolean {
  if (!viewingPerson.value) return false;
  viewingPerson.value = null;
  return true;
}
defineExpose({ back });
const deleting = ref<{ day: string; id: string } | null>(null);
function confirmDelete() {
  if (deleting.value) {
    phone.deleteTreeHole(deleting.value.day, deleting.value.id);
    if (commenting.value === deleting.value.id) {
      commenting.value = '';
      reply.value = '';
      replyTo.value = '';
    }
  }
  deleting.value = null;
}
import WaveModuleTranslation from '../shared/WaveModuleTranslation.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
const phone = usePhoneStore();
phone.ensureAnonymousProfile();
const anonymousProfile = computed(() => phone.state.moments.profile);
function isMine(comment: { mine?: boolean; alias: string }) {
  return comment.mine || comment.alias === '匿名的我';
}
watch(
  () => [phone.context?.cardKey, phone.context?.chatKey],
  () => {
    deleting.value = null;
    viewingPerson.value = null;
    phone.ensureAnonymousProfile();
  },
);
const day = ref(treeHoleDay()),
  draft = ref(''),
  reply = ref(''),
  replyTo = ref(''),
  commenting = ref(''),
  error = ref('');
const topic = computed(
  () => phone.state.treeHole[day.value]?.topic || dailyTopic(day.value, phone.context?.cardKey || ''),
);
const posts = computed(() => [...(phone.state.treeHole[day.value]?.posts || [])].reverse());
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  timer = setInterval(() => {
    day.value = treeHoleDay();
  }, 30000);
});
onUnmounted(() => clearInterval(timer));
function publish() {
  phone.publishTreeHole(draft.value, day.value);
  draft.value = '';
}
function sendComment(id: string) {
  phone.commentTreeHole(day.value, id, reply.value, replyTo.value);
  reply.value = '';
  replyTo.value = '';
  commenting.value = '';
}
async function refresh() {
  error.value = '';
  try {
    await phone.refreshTreeHole(day.value);
  } catch (cause) {
    error.value = String(cause);
  }
}
function time(value: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  return minutes < 1
    ? '刚刚'
    : minutes < 60
      ? `${minutes}分钟前`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}小时前`
        : new Date(value).toLocaleDateString();
}
</script>
