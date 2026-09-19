<template>
  <section class="space-hole">
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
      <header>
        <span class="space-comment-avatar">☁</span><strong>{{ post.alias }}</strong
        ><time>{{ time(post.createdAt) }}</time>
      </header>
      <p class="space-hole-copy">{{ post.content }}</p>
      <div class="space-hole-actions">
        <button type="button" :aria-pressed="post.liked" @click="phone.likeTreeHole(day, post.id)">
          <i :class="post.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i> 共鸣</button
        ><button type="button" @click="commenting = commenting === post.id ? '' : post.id">
          {{ post.comments.length }} 条回应
        </button>
      </div>
      <div v-for="comment in post.comments" :key="comment.id" class="space-comment">
        <span class="space-comment-avatar">☁</span>
        <div class="space-comment-main">
          <header>
            <strong>{{ comment.alias }}</strong
            ><time>{{ time(comment.createdAt) }}</time>
          </header>
          <p>
            <span v-if="comment.replyTo" class="space-mention">@{{ comment.replyTo }} </span>{{ comment.content }}
          </p>
          <button
            type="button"
            class="moment-reply-action"
            @click="
              commenting = post.id;
              replyTo = comment.alias;
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
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { dailyTopic, treeHoleDay } from '../../services/space/tree-hole';
const phone = usePhoneStore();
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
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
</script>
