<template>
  <div ref="element" class="wave-web-card" @click.stop>
    <a :href="safeUrl || undefined" target="_blank" rel="noopener noreferrer">
      <div class="wave-web-card-main">
        <div>
          <strong>{{ preview?.title || title || host || '分享链接' }}</strong>
          <p>{{ preview?.description || description || (busy ? '正在读取网页…' : host) }}</p>
        </div>
        <img
          v-if="imageUrl && !imageFailed"
          :src="imageUrl"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
          @error="imageFailed = true"
        />
        <span v-else class="wave-web-card-symbol"><i class="fa-solid fa-link"></i></span>
      </div>
      <footer>
        <img
          v-if="iconUrl && !iconFailed"
          :src="iconUrl"
          alt=""
          referrerpolicy="no-referrer"
          @error="iconFailed = true"
        /><i v-else class="fa-solid fa-globe"></i><span>{{ preview?.siteName || host || '链接地址未提供' }}</span
        ><i class="fa-solid fa-arrow-up-right-from-square"></i>
      </footer>
    </a>
    <button v-if="failed" type="button" class="wave-web-card-retry" @click.stop="resolve(true)">
      预览暂不可用 · 重试
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { getLinkPreview, webSettings, type LinkPreview } from '../../services/web-tools';
const props = withDefaults(defineProps<{ url: string; title?: string; description?: string }>(), {
  title: '',
  description: '',
});
const element = ref<HTMLElement>(),
  preview = ref<LinkPreview>(),
  busy = ref(false),
  failed = ref(false),
  imageFailed = ref(false),
  iconFailed = ref(false);
const safe = (value: string) => {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
};
const safeUrl = computed(() => safe(props.url));
const host = computed(() => (safeUrl.value ? new URL(safeUrl.value).hostname : ''));
const imageUrl = computed(() => safe(preview.value?.image || ''));
const iconUrl = computed(() => safe(preview.value?.icon || ''));
let revision = 0,
  visible = false,
  observer: IntersectionObserver | undefined;
async function resolve(retry = false) {
  if (!safeUrl.value || !webSettings.preview || !visible) return;
  const token = ++revision;
  busy.value = true;
  failed.value = false;
  try {
    const data = await getLinkPreview(safeUrl.value, retry);
    if (token === revision) preview.value = data;
  } catch {
    if (token === revision) failed.value = true;
  } finally {
    if (token === revision) busy.value = false;
  }
}
watch([safeUrl, () => webSettings.preview], () => {
  revision++;
  preview.value = undefined;
  busy.value = failed.value = imageFailed.value = iconFailed.value = false;
  void resolve();
});
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    visible = true;
    void resolve();
    return;
  }
  observer = new IntersectionObserver(
    entries => {
      if (entries.some(e => e.isIntersecting)) {
        visible = true;
        observer?.disconnect();
        void resolve();
      }
    },
    { rootMargin: '120px' },
  );
  if (element.value) observer.observe(element.value);
});
onUnmounted(() => {
  revision++;
  observer?.disconnect();
});
</script>
<style scoped lang="scss">
.wave-web-card {
  width: 320px;
  max-width: 100%;
  min-width: 0;
  margin: 8px 0;
  border-radius: 15px;
  overflow: hidden;
  background: var(--wave-card, #fff);
  color: var(--wave-ink);
  border: 1px solid var(--wave-line);
  text-align: left;
}
.wave-web-card a {
  display: block;
  color: inherit;
  text-decoration: none;
  padding: 14px 16px 10px;
}
.wave-web-card-main {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  > div {
    flex: 1;
    min-width: 0;
  }
  strong {
    font-size: 15px;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  p {
    margin: 7px 0 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--wave-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  > img,
  .wave-web-card-symbol {
    width: 64px;
    height: 64px;
    flex-shrink: 0;
    border-radius: 9px;
    object-fit: cover;
  }
}
.wave-web-card-symbol {
  display: grid;
  place-items: center;
  background: var(--wave-tint);
  color: var(--wave-accent);
  font-size: 24px;
}
footer {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding-top: 9px;
  border-top: 1px solid var(--wave-line);
  font-size: 11px;
  color: var(--wave-muted);
  img {
    width: 15px;
    height: 15px;
    object-fit: contain;
  }
  span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.wave-web-card-retry {
  width: 100%;
  padding: 7px 12px;
  border: 0;
  background: transparent;
  color: var(--wave-muted);
  font-size: 11px;
  cursor: pointer;
}
</style>
