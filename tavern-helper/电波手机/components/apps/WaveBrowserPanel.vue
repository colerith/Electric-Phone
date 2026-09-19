<template>
  <section class="wave-browser">
    <div class="browser-scroll">
      <div class="browser-wordmark" :class="{ google: engine === 'google' }" aria-label="搜索引擎">
        <template v-if="engine === 'google'"
          ><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></template
        ><template v-else>{{ searchEngineNames[engine] }}</template>
      </div>
      <form class="browser-search-field" @submit.prevent="search">
        <i class="fa-solid fa-magnifying-glass"></i
        ><input v-model="query" aria-label="搜索或输入网址" placeholder="搜索或输入网址" autocomplete="off" /><button
          type="submit"
          aria-label="搜索"
        >
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </form>
      <nav v-if="section === 'start'" class="browser-quick-sites" aria-label="常用网站">
        <a
          v-for="site in quickSites"
          :key="site.url"
          :href="site.url"
          target="_blank"
          rel="noopener noreferrer"
          @click="visit(entry(site.name, site.url))"
        >
          <span><img :src="site.icon" alt="" /></span><small>{{ site.name }}</small>
        </a>
      </nav>
      <nav class="browser-sections">
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          :aria-pressed="section === item.id"
          @click="section = item.id"
        >
          {{ item.name }}
        </button>
      </nav>
      <template v-if="section === 'start'">
        <p v-if="busy" role="status">正在搜索…</p>
        <p v-if="error" role="alert">{{ error }}，可点击下方打开网页继续搜索。</p>
        <div v-if="results.length" class="browser-section-heading">
          <strong>搜索结果</strong><small>{{ endpoint ? '网页搜索' : '维基百科' }} · {{ results.length }} 条</small>
        </div>
        <article v-for="result in results" :key="result.url" class="browser-result-card">
          <small>{{ browserHost(result.url) }}</small
          ><a :href="result.url" target="_blank" rel="noopener noreferrer" @click="visit(noteEntry(result))">{{
            result.title
          }}</a>
          <p>{{ result.content }}</p>
          <div>
            <button type="button" @click="$emit('bookmark', noteEntry(result))">
              <i :class="isBookmarked(result.url) ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'"></i
              >{{ isBookmarked(result.url) ? '已收藏' : '收藏' }}</button
            ><button type="button" @click="$emit('share', noteEntry(result))">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>转发到消息
            </button>
          </div>
        </article>

        <article v-if="current" class="browser-current-card">
          <small><i class="fa-solid fa-globe"></i>{{ browserHost(current.url) }}</small
          ><strong>{{ current.title }}</strong>
          <p>真实网页将在系统浏览器的新标签页中打开。</p>
          <div>
            <a :href="current.url" target="_blank" rel="noopener noreferrer" @click="record(current)"
              >打开网页<i class="fa-solid fa-arrow-up-right-from-square"></i></a
            ><button type="button" :aria-pressed="isBookmarked(current.url)" @click="$emit('bookmark', current)">
              <i :class="isBookmarked(current.url) ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'"></i
              >{{ isBookmarked(current.url) ? '已收藏' : '收藏' }}</button
            ><button type="button" @click="$emit('share', current)">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>转发
            </button>
          </div>
        </article>
        <div class="browser-section-heading">
          <strong>浏览手记</strong><small>{{ notes.length }} 条</small>
        </div>
        <article v-for="(note, index) in notes" :key="index" class="browser-result-card">
          <small>{{ note.url ? browserHost(note.url) : '搜索笔记' }}</small
          ><a
            v-if="note.url"
            :href="note.url"
            target="_blank"
            rel="noopener noreferrer"
            @click="visit(noteEntry(note))"
            >{{ note.title }}</a
          ><strong v-else>{{ note.title }}</strong>
          <p>{{ note.content }}</p>
          <WaveModuleTranslation app="browse" :translation="note.translation" />
          <div>
            <button v-if="note.url" type="button" @click="$emit('bookmark', noteEntry(note))">
              <i :class="isBookmarked(note.url) ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'"></i>收藏</button
            ><button type="button" @click="searchNote(note)"><i class="fa-solid fa-magnifying-glass"></i>搜索</button
            ><button v-if="note.url" type="button" @click="$emit('share', noteEntry(note))">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>转发
            </button>
            <button
              type="button"
              class="wave-content-delete"
              aria-label="删除浏览手记"
              @click="$emit('delete-note', note.id)"
            >
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </article>
        <p v-if="!notes.length" class="browser-empty-small">随手搜一搜，发现新的兴趣。</p>
      </template>
      <template v-else
        ><div class="browser-section-heading">
          <strong>{{ section === 'history' ? '最近访问' : '网页收藏' }}</strong
          ><small>{{ list.length }} 条</small>
        </div>
        <label class="browser-library-filter"
          ><i class="fa-solid fa-filter"></i><input v-model="filter" placeholder="筛选标题或网址" aria-label="筛选记录"
        /></label>
        <article v-for="item in list" :key="item.id" class="browser-saved-row">
          <span class="browser-site-icon">{{
            browserHost(item.url)
              .replace(/^www\./, '')
              .slice(0, 1)
              .toUpperCase()
          }}</span>
          <div>
            <a :href="item.url" target="_blank" rel="noopener noreferrer" @click="visit(item)">{{ item.title }}</a
            ><small>{{ browserHost(item.url) }}</small
            ><time v-if="section === 'history'">{{ new Date(item.visitedAt).toLocaleString('zh-CN') }}</time>
          </div>
          <button
            type="button"
            :aria-label="isBookmarked(item.url) ? '取消收藏' : '收藏网页'"
            @click="$emit('bookmark', item)"
          >
            <i :class="isBookmarked(item.url) ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'"></i></button
          ><button type="button" aria-label="转发到聊天" @click="$emit('share', item)">
            <i class="fa-solid fa-arrow-up-from-bracket"></i></button
          ><button
            type="button"
            :aria-label="`${section === 'history' ? '删除历史记录' : '删除收藏'}：${item.title}`"
            @click="$emit('remove', section === 'history' ? 'history' : 'bookmarks', item.id)"
          >
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </article>
        <p v-if="!list.length" class="browser-empty-small">
          {{ filter ? '没有匹配的记录' : '这里还没有记录。' }}
        </p></template
      >
    </div>
    <footer class="browser-toolbar">
      <div class="browser-address">
        <i class="fa-solid fa-globe"></i><span>{{ current ? browserHost(current.url) : '搜索或浏览收藏' }}</span
        ><button type="button" aria-label="浏览器设置" @click="$emit('settings')">
          <i class="fa-solid fa-sliders"></i>
        </button>
      </div>
      <nav>
        <button type="button" aria-label="上一个页面" :disabled="cursor <= 0" @click="navigate(-1)">
          <i class="fa-solid fa-chevron-left"></i></button
        ><button type="button" aria-label="下一个页面" :disabled="cursor >= trail.length - 1" @click="navigate(1)">
          <i class="fa-solid fa-chevron-right"></i></button
        ><button
          type="button"
          aria-label="转发当前网页"
          :disabled="!current"
          @click="current && $emit('share', current)"
        >
          <i class="fa-solid fa-arrow-up-from-bracket"></i></button
        ><button type="button" aria-label="收藏夹" @click="section = 'bookmarks'">
          <i class="fa-regular fa-bookmark"></i></button
        ><button type="button" aria-label="搜索记录" @click="section = 'history'">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </button>
      </nav>
    </footer>
  </section>
</template>
<script setup lang="ts">
import WaveModuleTranslation from '../shared/WaveModuleTranslation.vue';
import { browserSiteIcons } from '../../services/apps/browser-site-icons';
import { computed, ref, onBeforeUnmount } from 'vue';
import { searchWeb, type WebResult } from '../../services/core/network';
import {
  browserTarget,
  browserHost,
  parseBrowseNotes,
  safeBrowserUrl,
  searchEngineNames,
  type BrowserEntry,
  type SearchEngine,
} from '../../services/apps/browser';
const props = defineProps<{
  raw: string;
  history: BrowserEntry[];
  bookmarks: BrowserEntry[];
  engine: SearchEngine;
  endpoint: string;
}>();
const emit = defineEmits<{
  visit: [entry: BrowserEntry];
  bookmark: [entry: BrowserEntry];
  share: [entry: BrowserEntry];
  settings: [];
  remove: [section: 'history' | 'bookmarks', id: string];
  'delete-note': [id: string];
}>();
const section = ref('start');
const query = ref('');
const filter = ref('');
const trail = ref<BrowserEntry[]>([]);
const cursor = ref(-1);
const current = computed(() => trail.value[cursor.value] || null);
const sections = [
  { id: 'start', name: '搜索' },
  { id: 'history', name: '历史记录' },
  { id: 'bookmarks', name: '收藏夹' },
];
const quickSites = [
  { name: 'YouTube', url: 'https://www.youtube.com/', icon: browserSiteIcons.youtube },
  { name: '哔哩哔哩', url: 'https://www.bilibili.com/', icon: browserSiteIcons.bilibili },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org/', icon: browserSiteIcons.wikipedia },
  { name: 'GitHub', url: 'https://github.com/', icon: browserSiteIcons.github },
  { name: 'Reddit', url: 'https://www.reddit.com/', icon: browserSiteIcons.reddit },
  { name: 'X', url: 'https://x.com/', icon: browserSiteIcons.x },
];
const notes = computed(() => parseBrowseNotes(props.raw));
const bookmarks = computed(() => props.bookmarks.filter(item => safeBrowserUrl(item.url)));
const list = computed(() =>
  (section.value === 'history' ? props.history : bookmarks.value).filter(
    item => safeBrowserUrl(item.url) && `${item.title} ${item.url}`.toLowerCase().includes(filter.value.toLowerCase()),
  ),
);
function isBookmarked(url: string): boolean {
  return bookmarks.value.some(item => item.url === url);
}
function entry(title: string, url: string, query = ''): BrowserEntry {
  return {
    id: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    url,
    query,
    visitedAt: new Date().toISOString(),
  };
}
function record(item: BrowserEntry): void {
  emit('visit', { ...item, visitedAt: new Date().toISOString() });
}
function visit(item: BrowserEntry): void {
  trail.value = [...trail.value.slice(0, cursor.value + 1), item];
  cursor.value = trail.value.length - 1;
  record(item);
}
const results = ref<WebResult[]>([]);
const busy = ref(false);
const error = ref('');
let request: AbortController | undefined;
onBeforeUnmount(() => request?.abort());
async function search(): Promise<void> {
  if (!query.value.trim()) return;
  const url = browserTarget(query.value, props.engine);
  const item = entry(query.value.trim(), url, query.value.trim());
  visit(item);
  section.value = 'start';
  request?.abort();
  const controller = new AbortController();
  request = controller;
  results.value = [];
  error.value = '';
  busy.value = true;
  try {
    const rows = await searchWeb(query.value.trim(), props.endpoint, controller.signal);
    if (!controller.signal.aborted) results.value = rows;
  } catch (e) {
    if (!controller.signal.aborted) error.value = e instanceof Error ? e.message : '搜索加载失败';
  } finally {
    if (request === controller) busy.value = false;
  }
}
function navigate(offset: number): void {
  cursor.value = Math.max(0, Math.min(trail.value.length - 1, cursor.value + offset));
  section.value = 'start';
  if (current.value) query.value = current.value.query || current.value.url;
}
function noteEntry(note: { title: string; url: string }): BrowserEntry {
  return entry(note.title, note.url);
}
function searchNote(note: { title: string }): void {
  query.value = note.title;
  search();
}
</script>
