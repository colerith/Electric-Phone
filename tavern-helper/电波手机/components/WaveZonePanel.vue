<template>
  <section ref="root" class="wave-app-content app-zone">
    <div class="zone-profile-card">
      <button
        type="button"
        class="zone-profile-cover"
        :style="{ backgroundImage: 'linear-gradient(120deg, #d7e4ee, #eee0e9 55%, #e0e8eb)' }"
        aria-label="设置空间背景"
        @click="$emit('cover')"
      >
        <img v-if="cover" :src="cover" alt="空间封面" />
      </button>
      <div class="zone-profile-body">
        <span class="zone-profile-avatar"
          ><img v-if="avatar" :src="avatar" alt="" :style="avatarStyle" /><span v-else>{{
            username.slice(0, 1)
          }}</span></span
        >
        <strong class="zone-username">{{ username }}</strong>
        <span v-if="page.profile.handle" class="zone-handle">@{{ page.profile.handle.replace(/^@/, '') }}</span>
        <div v-if="page.profile.title || page.profile.tags.length" class="zone-badges">
          <span v-if="page.profile.title" class="zone-title-badge">{{ page.profile.title }}</span
          ><span v-for="tag in page.profile.tags" :key="tag">{{ tag }}</span>
        </div>
        <p class="zone-signature">{{ page.profile.signature || '尚未留下签名' }}</p>
        <small v-if="page.profile.location" class="zone-location"
          ><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{{ page.profile.location }}</small
        >
        <div class="zone-profile-actions">
          <button type="button" @click="$emit('message')"><i class="fa-regular fa-comment"></i>私聊</button>
        </div>
        <div class="zone-stats">
          <span
            ><b>{{ page.posts.length }}</b> 日记</span
          ><span
            ><b>{{ totalLikes }}</b> 喜欢</span
          ><span
            ><b>{{ totalComments }}</b> 评论</span
          >
        </div>
      </div>
    </div>
    <p v-if="error" class="zone-error" role="status">{{ error.replace(/[。．.\s]+$/, '') }}。已保存的互动仍会保留。</p>
    <div class="zone-feed-tools">
      <div>
        <button type="button" :aria-pressed="!likedOnly" @click="setLikedOnly(false)">日记</button
        ><button type="button" :aria-pressed="likedOnly" @click="setLikedOnly(true)">已喜欢</button>
      </div>
      <label
        ><i class="fa-solid fa-magnifying-glass"></i
        ><input v-model="query" placeholder="搜索日记" aria-label="搜索空间日记"
      /></label>
    </div>
    <article v-for="post in posts" :id="`wave-zone-post-${post.id}`" :key="post.id" class="zone-diary-card">
      <header class="zone-diary-heading">
        <span class="zone-mini-avatar"
          ><img v-if="avatar" :src="avatar" alt="" :style="avatarStyle" /><span v-else>{{
            username.slice(0, 1)
          }}</span></span
        >
        <div>
          <strong>{{ username }}</strong
          ><small v-if="page.profile.handle">@{{ page.profile.handle.replace(/^@/, '') }}</small>
        </div>
        <time v-if="post.date">{{ post.date }}</time>
      </header>
      <div class="zone-diary-copy">
        <strong v-if="post.title">{{ post.title }}</strong>
        <p :class="{ collapsed: !expanded.has(post.id) && post.content.length > 180 }">{{ post.content }}</p>
        <WaveModuleTranslation app="zone" :translation="post.translation" />
        <button
          v-if="post.content.length > 180"
          type="button"
          @click="expanded.has(post.id) ? expanded.delete(post.id) : expanded.add(post.id)"
        >
          {{ expanded.has(post.id) ? '收起' : `展开全文（${post.content.length}字）` }}
        </button>
      </div>
      <footer class="zone-diary-actions">
        <small><i class="fa-regular fa-bookmark"></i>{{ post.category }}</small
        ><button
          type="button"
          :aria-pressed="interaction(post.id).liked"
          aria-label="点赞动态"
          @click="$emit('like', post.id)"
        >
          <i :class="interaction(post.id).liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i
          ><span>{{ post.likes + Number(interaction(post.id).liked) || '' }}</span></button
        ><button
          type="button"
          :aria-expanded="commentsOpen.has(post.id)"
          aria-label="查看与添加评论"
          @click="toggleComments(post.id)"
        >
          <i class="fa-regular fa-comment"></i><span>{{ comments(post).length || '' }}</span></button
        ><button type="button" aria-label="转发动态" @click="$emit('share', post, username)">
          <i class="fa-solid fa-arrow-up-from-bracket"></i>
        </button>
        <button type="button" class="wave-content-delete" aria-label="删除空间日记" @click="$emit('delete', post.id)">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </footer>
      <div v-if="commentsOpen.has(post.id)" class="zone-comments">
        <button
          v-for="comment in comments(post)"
          :key="comment.id"
          type="button"
          class="zone-comment"
          :class="{ reply: !!comment.parentId }"
          :aria-label="`回复 ${comment.author || '匿名'}：${comment.content}`"
          @click="replying[post.id] = comment"
        >
          <strong>{{ comment.author || '匿名' }}</strong
          ><span v-if="comment.replyToAuthor"> 回复 {{ comment.replyToAuthor }}</span>
          <p>{{ comment.content }}</p>
        </button>
        <p v-if="!comments(post).length" class="zone-no-comments">留下第一条评论。</p>
        <form @submit.prevent="submitComment(post.id)">
          <div v-if="replying[post.id]" class="zone-reply-target">
            回复 {{ replying[post.id]?.author || '匿名' }}
            <button type="button" aria-label="取消回复" @click="delete replying[post.id]">×</button>
          </div>
          <textarea
            v-model="drafts[post.id]"
            rows="2"
            maxlength="1000"
            aria-label="评论内容"
            :placeholder="replying[post.id] ? `回复 ${replying[post.id]?.author || '匿名'}…` : '写一条评论…'"
          ></textarea
          ><button type="submit" :disabled="busy || !drafts[post.id]?.trim()">评论</button>
        </form>
      </div>
    </article>
    <div v-if="!posts.length" class="zone-empty">
      <i class="fa-regular fa-pen-to-square"></i
      ><strong>{{ query || likedOnly ? '没有匹配的日记' : '故事还未落笔' }}</strong>
      <p>{{ query || likedOnly ? '换个关键词或查看全部日记。' : '点击右上角魔术棒，让 TA 留下自己的生活片段。' }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import WaveModuleTranslation from './WaveModuleTranslation.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { artworkUrl } from '../services/artworks';
import { parseZonePage, type ZonePost, type ZoneInteraction, type ZoneComment } from '../services/zone';
const props = defineProps<{
  raw: string;
  artwork: string;
  name: string;
  remark: string;
  avatar: string;
  avatarStyle: Record<string, string>;
  interactions: Record<string, ZoneInteraction>;
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{
  refresh: [];
  cover: [];
  message: [];
  like: [postId: string];
  comment: [postId: string, content: string, parent?: ZoneComment];
  share: [post: ZonePost, author: string];
  delete: [postId: string];
}>();
const page = computed(() => parseZonePage(props.raw));
const root = ref<HTMLElement | null>(null);
const username = computed(() => page.value.profile.username || props.remark.trim() || props.name);
const cover = computed(() => artworkUrl(props.artwork));
const query = ref('');
const likedOnly = ref(false);
const expanded = ref(new Set<string>());
const commentsOpen = ref(new Set<string>());
const drafts = ref<Record<string, string>>({});
const replying = ref<Record<string, ZoneComment>>({});
function interaction(id: string): ZoneInteraction {
  return props.interactions[id] || { liked: false, comments: [], shares: 0 };
}
function comments(post: ZonePost) {
  return [
    ...new Map([...post.comments, ...interaction(post.id).comments].map(comment => [comment.id, comment])).values(),
  ];
}
const posts = computed(() =>
  page.value.posts.filter(
    post =>
      (!likedOnly.value || interaction(post.id).liked) &&
      `${post.title} ${post.content} ${post.category}`
        .toLocaleLowerCase()
        .includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const totalLikes = computed(() =>
  page.value.posts.reduce((total, post) => total + post.likes + Number(interaction(post.id).liked), 0),
);
const totalComments = computed(() => page.value.posts.reduce((total, post) => total + comments(post).length, 0));
function revealProfile(): void {
  void nextTick(() => {
    if (root.value) root.value.scrollTop = 0;
  });
}
function setLikedOnly(value: boolean): void {
  likedOnly.value = value;
  revealProfile();
}
watch(
  () => [page.value.profile.signature, page.value.profile.title, page.value.profile.tags.join('\u0000')],
  revealProfile,
);
function toggleComments(id: string): void {
  if (commentsOpen.value.has(id)) commentsOpen.value.delete(id);
  else commentsOpen.value.add(id);
}
function submitComment(id: string): void {
  if (!drafts.value[id]?.trim() || props.busy) return;
  emit('comment', id, drafts.value[id].trim(), replying.value[id]);
  drafts.value[id] = '';
  delete replying.value[id];
}
</script>
