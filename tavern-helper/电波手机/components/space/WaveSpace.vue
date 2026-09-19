<template>
  <section class="space-app" :class="{ 'space-subpage': moments?.isSubpage }">
    <div class="space-scroll">
      <template v-if="tab === 'char'">
        <div class="zone-profile-card space-char-profile">
          <button type="button" class="zone-profile-cover" aria-label="设置空间封面" @click="$emit('cover')">
            <img v-if="cover" :src="cover" alt="" />
          </button>
          <div class="zone-profile-body">
            <span class="zone-profile-avatar"
              ><img v-if="avatar" :src="avatar" :style="avatarStyle" alt="" /><span v-else>{{
                name.slice(0, 1)
              }}</span></span
            ><strong class="zone-username">{{ page.profile.username || name }}</strong
            ><span v-if="page.profile.handle" class="zone-handle">@{{ page.profile.handle.replace(/^@+/, '') }}</span>
            <WaveProfileDecorations
              :title="page.profile.title"
              :title-color="page.profile.titleColor"
              :badges="page.profile.badges"
            />
            <div v-if="page.profile.tags.length" class="zone-badges">
              <span v-for="tag in page.profile.tags" :key="tag">{{ tag }}</span>
            </div>
            <p class="zone-signature">{{ page.profile.signature || '记录生活里的小事' }}</p>
            <small v-if="page.profile.location" class="zone-location">{{ page.profile.location }}</small>
            <div class="zone-profile-actions">
              <button type="button" @click="$emit('message')">私聊</button
              ><button type="button" :disabled="busy" @click="$emit('refresh')">
                {{ busy ? '更新中…' : '更新动态' }}
              </button>
            </div>
            <div class="zone-stats">
              <span
                ><b>{{ charStats.posts }}</b> 日记</span
              ><span
                ><b>{{ charStats.likes }}</b> 喜欢</span
              ><span
                ><b>{{ charStats.comments }}</b> 评论</span
              >
            </div>
          </div>
        </div>
        <div class="space-feed-tools">
          <div>
            <button type="button" :aria-pressed="!likedOnly" @click="likedOnly = false">日记</button
            ><button type="button" :aria-pressed="likedOnly" @click="likedOnly = true">已喜欢</button>
          </div>
          <label
            ><i class="fa-solid fa-magnifying-glass"></i
            ><input v-model="query" placeholder="搜索日记" aria-label="搜索空间日记"
          /></label>
        </div>
        <p v-if="error" class="zone-error">{{ error }}</p>
      </template>
      <div v-if="tab === 'world'" class="space-world-heading">
        <div>
          <small>此刻，世界正在发生</small>
          <h2>世界动态</h2>
        </div>
        <button type="button" :disabled="phone.moduleGenerating" @click="refreshWorld">
          {{ phone.moduleGenerating ? '更新中…' : '更新' }}
        </button>
      </div>
      <p v-if="worldError && tab === 'world'" class="zone-error" role="status">{{ worldError }}</p>
      <WaveTreeHole v-if="tab === 'hole'" />
      <WaveMoments
        v-show="tab !== 'hole'"
        :key="tab === 'hole' ? 'world' : tab"
        ref="moments"
        :view="tab === 'me' ? 'me' : 'feed'"
        context="space"
        embedded
        :author-key="tab === 'char' ? phone.activeIdentity?.charKey : undefined"
        :query="tab === 'char' ? query : ''"
        :liked-only="tab === 'char' && likedOnly"
        :user-name="userName"
        :user-avatar="userAvatar"
        @share="(post, author) => $emit('share', post, author)"
      />
    </div>
    <nav
      v-if="!moments?.isComposing && (!moments?.isSubpage || tab === 'hole')"
      class="space-bottom"
      aria-label="空间导航"
    >
      <button type="button" :aria-current="tab === 'char' ? 'page' : undefined" @click="tab = 'char'">
        <i class="fa-solid fa-book-open"></i><span>角色</span></button
      ><button type="button" :aria-current="tab === 'world' ? 'page' : undefined" @click="tab = 'world'">
        <i class="fa-solid fa-earth-asia"></i><span>世界</span></button
      ><button type="button" class="space-publish" aria-label="发布动态" @click="publish">
        <i class="fa-solid fa-pen-nib"></i><span>发布</span></button
      ><button type="button" :aria-current="tab === 'hole' ? 'page' : undefined" @click="tab = 'hole'">
        <i class="fa-regular fa-comment-dots"></i><span>树洞</span></button
      ><button type="button" :aria-current="tab === 'me' ? 'page' : undefined" @click="tab = 'me'">
        <img v-if="userAvatar" :src="userAvatar" alt="" /><i v-else class="fa-regular fa-user"></i><span>我的</span>
      </button>
    </nav>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, type CSSProperties } from 'vue';
import { useNow } from '@vueuse/core';
import WaveProfileDecorations from './WaveProfileDecorations.vue';
import WaveMoments from './WaveMoments.vue';
import WaveTreeHole from './WaveTreeHole.vue';
import { parseZonePage } from '../../services/space/zone';
import { artworkUrl } from '../../services/core/artworks';
import type { MomentPost } from '../../services/space/moments';
import { usePhoneStore } from '../../stores/phone';
const props = defineProps<{
  raw: string;
  artwork: string;
  name: string;
  avatar: string;
  avatarStyle?: CSSProperties;
  userName: string;
  userAvatar: string;
  busy: boolean;
  error: string;
}>();
defineEmits<{ cover: []; refresh: []; message: []; share: [post: MomentPost, author: string] }>();
const phone = usePhoneStore(),
  tab = ref<'char' | 'world' | 'hole' | 'me'>('char');
const moments = ref<InstanceType<typeof WaveMoments> | null>(null),
  worldError = ref('');
const query = ref(''),
  likedOnly = ref(false),
  now = useNow({ interval: 1000 });
const charStats = computed(() => {
  const posts = phone.momentsFeed.posts.filter(
    post => post.authorKey === phone.activeIdentity?.charKey && post.availableAt <= now.value.getTime(),
  );
  const ids = new Set(posts.map(post => post.id));
  return {
    posts: posts.length,
    likes:
      posts.reduce((sum, post) => sum + post.legacyLikeCount, 0) +
      phone.momentsFeed.likes.filter(item => ids.has(item.postId) && item.availableAt <= now.value.getTime()).length,
    comments: phone.momentsFeed.comments.filter(item => ids.has(item.postId) && item.availableAt <= now.value.getTime())
      .length,
  };
});
const page = computed(() => parseZonePage(props.raw));
const cover = computed(() => artworkUrl(props.artwork));
async function publish() {
  if (tab.value === 'hole') {
    tab.value = 'world';
    await nextTick();
  }
  moments.value?.openComposer();
}
async function refreshWorld() {
  worldError.value = '';
  try {
    await phone.generateMoments();
  } catch (error) {
    worldError.value = String(error);
  }
}
function back(): boolean {
  return moments.value?.back() || false;
}
const headerTitle = computed(() =>
  moments.value?.isSubpage && tab.value !== 'hole'
    ? moments.value.subpageTitle
    : { char: '角色空间', world: '世界', hole: '匿名树洞', me: '我的空间' }[tab.value],
);
defineExpose({ tab, back, headerTitle });
</script>
