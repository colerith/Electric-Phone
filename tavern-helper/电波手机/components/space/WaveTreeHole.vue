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
      <label v-if="historyDays.length > 1" class="hole-history"
        ><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>历史树洞</span
        ><select v-model="day" aria-label="查看历史树洞">
          <option v-for="date in historyDays" :key="date" :value="date">
            {{ date === treeHoleDay() ? '今天' : date }}
          </option>
        </select></label
      >
      <h2>{{ topic }}</h2>
      <p>藏起名字，说说心里话。发帖和互动跟随空间设置，树洞不配图。</p>
      <button type="button" :disabled="phone.zoneGenerating || phone.moduleGenerating" @click="refresh">
        {{ phone.zoneGenerating || phone.moduleGenerating ? '回声正在路上…' : '听听大家的声音' }}
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
    <article v-for="post in posts" :key="post.id" class="space-hole-post" :data-hole-post="post.id">
      <header class="space-post-header">
        <WaveAnonymousAvatar :seed="post.mine ? anonymousProfile.anonymousAvatarSeed : `${day}:${post.alias}`" />
        <div class="space-post-author-details">
          <button
            type="button"
            class="moment-person-link"
            @click="
              showPerson(
                post.mine ? anonymousProfile.anonymousId : post.alias,
                post.mine ? anonymousProfile.anonymousAvatarSeed : `${day}:${post.alias}`,
              )
            "
          >
            {{ post.mine ? anonymousProfile.anonymousId : post.alias }}
          </button>
        </div>
      </header>
      <p class="space-hole-copy">{{ post.content }}</p>
      <WaveModuleTranslation app="moments" :translation="post.translation" inline />
      <div class="space-hole-meta">
        <time>{{ time(post.createdAt) }}</time>
      </div>
      <div class="space-hole-actions">
        <div class="hole-primary-actions">
          <button type="button" :aria-pressed="post.liked" @click="phone.likeTreeHole(day, post.id)">
            <i :class="post.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i>
            {{ post.likeCount || '共鸣' }}</button
          ><button
            type="button"
            @click="
              commenting = commenting === post.id ? '' : post.id;
              replyTo = '';
              replyToId = '';
            "
          >
            <i class="fa-solid fa-comment"></i> {{ post.comments.length }} 条回应
          </button>
          <button type="button" aria-label="转发匿名动态" @click="share(post)">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>转发
          </button>
        </div>
        <div class="hole-secondary-actions">
          <button type="button" :disabled="phone.moduleGenerating || phone.zoneGenerating" @click="interact(post.id)">
            触发互动
          </button>
          <button
            type="button"
            class="wave-content-delete"
            aria-label="删除匿名动态"
            @click="deleting = { day, id: post.id }"
          >
            <i class="fa-regular fa-trash-can"></i> 删除
          </button>
        </div>
      </div>
      <div v-for="comment in post.comments" :key="comment.id" class="space-comment" :data-hole-comment="comment.id">
        <WaveAnonymousAvatar
          :seed="isMine(comment) ? anonymousProfile.anonymousAvatarSeed : `${day}:${comment.alias}`"
        />
        <div class="space-comment-main">
          <header>
            <button
              type="button"
              class="moment-person-link"
              @click="
                showPerson(
                  isMine(comment) ? anonymousProfile.anonymousId : comment.alias,
                  isMine(comment) ? anonymousProfile.anonymousAvatarSeed : `${day}:${comment.alias}`,
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
          <WaveModuleTranslation app="moments" :translation="comment.translation" inline />
          <div class="hole-comment-actions">
            <button
              type="button"
              class="moment-reply-action"
              @click="
                commenting = post.id;
                replyTo = isMine(comment) ? anonymousProfile.anonymousId : comment.alias;
                replyToId = comment.id;
              "
            >
              回复
            </button>
            <button
              type="button"
              :disabled="phone.moduleGenerating || phone.zoneGenerating"
              @click="interact(post.id, comment.id)"
            >
              触发互动
            </button>
            <button type="button" class="wave-content-delete" @click="phone.deleteTreeHoleComment(day, comment.id)">
              <i class="fa-regular fa-trash-can"></i>删除
            </button>
          </div>
        </div>
      </div>
      <form v-if="commenting === post.id" class="moment-comment-form" @submit.prevent="sendComment(post.id)">
        <div v-if="replyTo" class="hole-reply-target">
          <i class="fa-solid fa-reply"></i><span>回复</span><strong>{{ replyTo }}</strong
          ><WaveCloseButton
            label="取消回复"
            @close="
              replyTo = '';
              replyToId = '';
            "
          />
        </div>
        <input v-model="reply" maxlength="500" placeholder="匿名回应…" aria-label="匿名评论" /><button
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
import { MomentPostSchema, type MomentPost, momentTimeline } from '../../services/space/moments';
import WaveCloseButton from '../shared/WaveCloseButton.vue';
import WaveAnonymousAvatar from './WaveAnonymousAvatar.vue';
import WaveNpcProfile from './WaveNpcProfile.vue';
import { anonymousAvatarUrl, dailyTopic, treeHoleDay } from '../../services/space/tree-hole';
import WaveDeleteConfirm from '../shared/WaveDeleteConfirm.vue';
const emit = defineEmits<{ share: [post: MomentPost, author: string] }>();
function share(post: ReturnType<typeof phone.treeHoleFeed>[number]) {
  const author = post.mine ? anonymousProfile.value.anonymousId : post.alias;
  emit(
    'share',
    MomentPostSchema.parse({
      id: post.id,
      authorKey: 'anonymous',
      authorName: author,
      content: post.content,
      translation: post.translation,
      createdAt: post.createdAt,
      availableAt: post.createdAt,
    }),
    author,
  );
}
const viewingPerson = ref<{ name: string; avatar: string } | null>(null);
function showPerson(name: string, seed: string): void {
  viewingPerson.value = { name, avatar: anonymousAvatarUrl(seed) };
}
function back(): boolean {
  if (!viewingPerson.value) return false;
  viewingPerson.value = null;
  return true;
}
async function openPost(date: string, postId: string, commentId = '') {
  day.value = date;
  await nextTick();
  const selector = commentId ? '[data-hole-comment]' : '[data-hole-post]';
  const root = document.querySelector('.space-hole');
  const target = Array.from(root?.querySelectorAll<HTMLElement>(selector) || []).find(node =>
    commentId ? node.dataset.holeComment === commentId : node.dataset.holePost === postId,
  );
  target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}
defineExpose({ back, openPost });
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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
    commenting.value = '';
    reply.value = '';
    replyTo.value = '';
    replyToId.value = '';
    phone.ensureAnonymousProfile();
  },
);
const day = ref(treeHoleDay()),
  draft = ref(''),
  reply = ref(''),
  replyTo = ref(''),
  replyToId = ref(''),
  now = ref(Date.now()),
  commenting = ref(''),
  error = ref('');
const historyDays = computed(() =>
  [...new Set([treeHoleDay(), day.value, ...Object.keys(phone.state.treeHole)])].sort().reverse(),
);
let currentDay = treeHoleDay();
const topic = computed(
  () => phone.state.treeHole[day.value]?.topic || dailyTopic(day.value, phone.context?.cardKey || ''),
);
const posts = computed(() => [...phone.treeHoleFeed(day.value, now.value)].reverse());
let timer: ReturnType<typeof setTimeout> | undefined;
function tick() {
  clearTimeout(timer);
  now.value = Date.now();
  const today = treeHoleDay();
  if (day.value === currentDay) day.value = today;
  currentDay = today;
  if (!document.hidden) {
    const activity = phone.state.treeHole[day.value]?.activity;
    const feed = activity ? momentTimeline(activity) : { posts: [], comments: [], likes: [] };
    const next = [...feed.posts, ...feed.comments, ...feed.likes].reduce(
      (due, item) => (item.availableAt > now.value ? Math.min(due, item.availableAt) : due),
      now.value + 30000,
    );
    timer = setTimeout(tick, Math.max(1, next - now.value));
  }
}
watch(() => phone.state.treeHole, tick, { deep: true });
onMounted(() => {
  tick();
  document.addEventListener('visibilitychange', tick);
});
onUnmounted(() => {
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', tick);
});
async function interact(postId: string, commentId?: string) {
  error.value = '';
  try {
    await phone.refreshTreeHole(day.value, postId, commentId);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
function publish() {
  phone.publishTreeHole(draft.value, day.value);
  draft.value = '';
}
function sendComment(id: string) {
  phone.commentTreeHole(day.value, id, reply.value, replyToId.value);
  reply.value = '';
  replyTo.value = '';
  replyToId.value = '';
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

<style scoped>
#wave-phone-script-root .space-hole .hole-interaction-status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 8px 0 0;
  padding: 8px 11px;
  border-radius: 10px;
  background: var(--wave-tint, #f5f7fa);
  color: var(--settings-muted, #8893a3);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.hole-interaction-status i {
  flex: none;
  font-size: 11px;
  color: var(--settings-accent, #6283bd);
}
.hole-history {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
  font-size: 11px;
  color: var(--settings-muted, #8893a3);
}
#wave-phone-script-root .space-hole .hole-history select {
  width: auto;
  padding: 5px 9px;
  font-size: 11px;
  border-radius: 8px;
  background: var(--wave-tint, #f5f7fa);
  border: 0;
  color: inherit;
}

#wave-phone-script-root .space-hole .space-hole-meta {
  margin-top: 14px;
  color: var(--settings-muted);
  font-size: 10px;
}
#wave-phone-script-root .space-hole .space-hole-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 8px 0 0;
}
.hole-primary-actions,
.hole-secondary-actions,
.hole-comment-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.hole-secondary-actions {
  margin-left: auto;
}
#wave-phone-script-root .space-hole .space-hole-actions button,
#wave-phone-script-root .space-hole .hole-comment-actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 5px 2px;
  font-size: 11px;
  white-space: nowrap;
  background: none;
  border: 0;
  color: var(--settings-accent);
}
#wave-phone-script-root .space-hole .space-hole-actions .wave-content-delete,
#wave-phone-script-root .space-hole .hole-comment-actions .wave-content-delete {
  color: var(--danger, #e66b8a);
}
#wave-phone-script-root .space-hole .hole-reply-target {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 10px;
  background: var(--settings-soft, #f3f5f8);
  color: var(--settings-muted);
  font-size: 11px;
  --wave-close-bg: transparent;
  --wave-close-color: var(--settings-muted);
}
.hole-reply-target strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
</style>
