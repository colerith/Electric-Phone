<template>
  <div class="wave-message-content" :class="[`message-kind-${message.type}`, { withdrawn: message.withdrawn }]">
    <div v-if="message.withdrawn" class="wave-message-withdrawn">
      <i class="fa-solid fa-arrow-rotate-left"></i><span>这条讯号已撤回</span>
    </div>

    <template v-else>
      <details v-if="electricText && !phone.settings.appearance.hideElectric" class="wave-electric">
        <summary>
          <i class="fa-regular fa-clock"></i><span>{{ electricTitle }}</span
          ><i class="fa-solid fa-chevron-right"></i>
        </summary>
        <pre>{{ electricText }}</pre>
      </details>
      <div v-if="quotedText && message.type !== 'text'" class="wave-message-quote">
        <i class="fa-solid fa-reply" aria-hidden="true"></i>
        <div>
          <small>回复消息</small>
          <p>{{ quotedText }}</p>
        </div>
      </div>
      <div v-if="message.type === 'text'" class="wave-bilingual-message wave-message-text">
        <p class="wave-original-text">{{ primaryText }}</p>
        <div v-if="quotedText" class="wave-message-quote wave-message-quote-inline" aria-label="引用消息">
          <i class="fa-solid fa-reply" aria-hidden="true"></i>
          <p :title="quotedText">{{ quotedText }}</p>
        </div>
        <div v-if="translationEnabled && translationOpen && secondaryText" class="wave-translation-bubble">
          <p>{{ secondaryText }}</p>
        </div>
        <button
          v-if="translationEnabled"
          class="wave-translation-toggle"
          type="button"
          :disabled="translationBusy"
          :aria-expanded="translationOpen"
          @click.stop="toggleTranslation"
        >
          {{
            translationBusy
              ? '翻译中…'
              : translationOpen
                ? `收起${secondaryLabel}`
                : translation
                  ? `展开${secondaryLabel}`
                  : '翻译消息'
          }}
        </button>
        <small v-if="translationEnabled && translationError" class="wave-translation-error" role="status">{{
          translationError
        }}</small>
      </div>
      <figure v-else-if="message.type === 'emoji' && stickerUrl" class="wave-message-sticker">
        <img :src="stickerUrl" :alt="payloadString('name') || message.content || '表情包'" />
      </figure>
      <div v-else-if="message.type === 'emoji'" class="wave-message-emoji">
        {{ payloadString('emoji') || message.content }}
      </div>

      <div
        v-else-if="message.type === 'image' && album.length > 1"
        class="wave-photo-album"
        :class="{ expanded: albumExpanded }"
      >
        <button type="button" class="album-toggle" @click.stop="albumExpanded = !albumExpanded">
          {{ albumExpanded ? '收起' : '展开' }} {{ album.length }}
        </button>
        <figure
          v-for="(photo, index) in album"
          v-show="albumExpanded || index < 3"
          :key="index"
          class="album-photo"
          :style="{ '--photo-index': index }"
        >
          <img :src="photo.url" :alt="photo.description || '照片'" />
          <figcaption>{{ photo.description }}</figcaption>
        </figure>
      </div>
      <figure
        v-else-if="message.type === 'image'"
        class="wave-message-media image-card"
        :class="{ empty: !safeMediaUrl }"
      >
        <div class="wave-polaroid-frame">
          <img v-if="safeMediaUrl" :src="safeMediaUrl" :alt="mediaDescription || '聊天照片'" />
          <div v-else class="wave-photo-placeholder"><i class="fa-regular fa-image" aria-hidden="true"></i></div>
        </div>
        <figcaption class="wave-polaroid-caption">
          {{ mediaDescription || '一张照片'
          }}<span class="polaroid-stamp"
            ><small>Wave Memoirs</small
            ><time>{{
              new Date(message.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
            }}</time></span
          >
        </figcaption>
      </figure>
      <div v-else-if="message.type === 'video'" class="wave-message-media video-card" :class="{ empty: !safeMediaUrl }">
        <div class="wave-video-screen" :class="{ 'has-video': safeMediaUrl }">
          <video
            v-if="safeMediaUrl"
            ref="videoElement"
            :src="safeMediaUrl"
            playsinline
            preload="metadata"
            :controls="videoStarted"
            @click.stop
            @play="
              videoPlaying = true;
              videoStarted = true;
            "
            @pause="videoPlaying = false"
            @ended="videoPlaying = false"
            @error="videoError = '视频暂时无法加载'"
          />
          <button
            v-if="!videoPlaying"
            type="button"
            class="wave-video-play"
            :aria-label="safeMediaUrl ? '播放视频' : '查看视频说明'"
            :class="{ pulsing: videoPreview }"
            @click.stop="playVideo"
          >
            <i class="fa-solid fa-play" aria-hidden="true"></i>
          </button>
        </div>
        <p class="wave-video-description">{{ mediaDescription || '一段视频' }}</p>
        <small v-if="videoError || (videoPreview && !safeMediaUrl)" class="wave-video-feedback">{{
          videoError || '这是一段剧情影像描述，尚未附视频文件'
        }}</small>
      </div>

      <div v-else-if="message.type === 'voice'" class="wave-message-voice" :class="{ playing: voicePlaying }">
        <button
          type="button"
          :aria-label="voiceBusy ? '取消合成' : voicePlaying ? '暂停语音' : '合成并播放语音'"
          @click.stop="toggleVoice"
        >
          <i
            :class="voiceBusy ? 'fa-solid fa-spinner fa-spin' : voicePlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'"
          ></i>
        </button>
        <button
          class="wave-voice-summary"
          type="button"
          :aria-expanded="transcriptOpen"
          aria-label="展开或收起语音转写"
          @click.stop="transcriptOpen = !transcriptOpen"
        >
          <span class="wave-voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <b>{{ voiceDuration }}″</b>
        </button>
        <div v-if="transcriptOpen" class="wave-voice-transcript">
          <span>原文</span>
          <p>{{ displaySpeechText(voiceTranscript) }}</p>
          <template v-if="preferences.autoTranslate && translation">
            <span>译文</span>
            <p>{{ displaySpeechText(translation) }}</p>
          </template>
        </div>
        <p v-if="voiceError" class="voice-play-error" role="alert">{{ voiceError }}</p>
      </div>

      <div v-else-if="message.type === 'transfer'" class="wave-message-transfer" :class="`transfer-${transferState}`">
        <div class="wave-transfer-amount">
          <i>✦</i><strong>{{ payloadString('currency') || 'CNY' }} {{ amountText }}</strong
          ><i>✦</i>
        </div>
        <span class="wave-transfer-script">Wave Memoirs</span>
        <p>· {{ payloadString('note') || message.content || '转账备注' }} ·</p>
        <div class="wave-transfer-state">
          <b>{{ transferStateLabel }}</b
          ><i aria-hidden="true"></i>
        </div>
      </div>

      <div v-else-if="message.type === 'location'" class="wave-message-location">
        <div class="wave-location-map" :style="locationStyle" aria-hidden="true">
          <i class="road road-a"></i><i class="road road-b"></i><i class="road road-c"></i><i class="road road-d"></i>
          <span class="map-block block-a"></span><span class="map-block block-b"></span
          ><span class="map-block block-c"></span>
          <svg class="upright-location-pin" viewBox="0 0 40 52">
            <path
              d="M20 2C9 2 2 10 2 20c0 13 18 30 18 30s18-17 18-30C38 10 31 2 20 2Z"
              fill="var(--message-primary, #ff9abc)"
              stroke="white"
              stroke-width="3"
            />
            <circle cx="20" cy="19" r="6" fill="white" />
          </svg>
        </div>
        <div class="wave-location-copy">
          <span
            ><small>共享位置 · {{ distanceLabel(locationDistance(message)) }}</small
            ><strong>{{ payloadString('name') || message.content }}</strong></span
          >
          <i class="fa-solid fa-chevron-right"></i>
        </div>
      </div>

      <div v-else-if="message.type === 'link'" class="wave-message-shared-link">
        <p v-if="forwardNote" class="wave-forward-note">{{ forwardNote }}</p>
        <a
          class="wave-message-link"
          :href="safeLinkUrl || undefined"
          :target="safeLinkUrl ? '_blank' : undefined"
          :rel="safeLinkUrl ? 'noopener noreferrer' : undefined"
        >
          <span><i class="fa-solid fa-link"></i></span>
          <div>
            <strong>{{ payloadString('title') || message.content || '分享链接' }}</strong
            ><small>{{ linkHost }}</small>
          </div>
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </a>
      </div>
      <div v-else-if="message.type === 'call'" class="wave-message-call">
        <span><i :class="payloadString('kind') === 'video' ? 'fa-solid fa-video' : 'fa-solid fa-phone'"></i></span>
        <div>
          <small>{{ payloadString('kind') === 'video' ? '视频通话' : '语音通话' }}</small
          ><strong>{{ message.content }}</strong>
        </div>
        <b>{{ payloadString('state') === 'ended' ? '已结束' : '剧情邀请' }}</b>
      </div>
      <div v-else-if="message.type === 'zone'" class="wave-message-zone">
        <p v-if="forwardNote" class="wave-forward-note">{{ forwardNote }}</p>
        <header>
          <i :class="shareKind === 'moment' ? 'fa-regular fa-images' : 'fa-regular fa-newspaper'"></i
          ><span>{{ shareKind === 'moment' ? '分享朋友圈' : '分享空间动态' }}</span>
        </header>
        <strong>{{ payloadString('author') || 'TA' }}</strong
        ><small v-if="payloadString('date')">{{ payloadString('date') }}</small
        ><b v-if="payloadString('title')">{{ payloadString('title') }}</b>
        <p class="wave-shared-summary">{{ sharedSummary }}</p>
        <div class="wave-shared-actions">
          <button type="button" @click.stop="sharedDetailOpen = true">查看全文</button>
          <button v-if="canJumpToZone" type="button" @click.stop="jumpToZone">定位原文</button>
        </div>
      </div>
      <div v-else class="wave-message-system"><i class="fa-solid fa-satellite-dish"></i>{{ message.content }}</div>
    </template>
    <Teleport v-if="surface && sharedDetailOpen" :to="surface">
      <div
        class="wave-shared-detail-backdrop"
        @click.self="sharedDetailOpen = false"
        @keydown.esc.stop.prevent="sharedDetailOpen = false"
      >
        <section class="wave-shared-detail" role="dialog" aria-modal="true" aria-label="转发内容全文">
          <header>
            <span>{{ shareKind === 'moment' ? '朋友圈全文' : '空间动态全文' }}</span
            ><button type="button" aria-label="关闭" @click="sharedDetailOpen = false">×</button>
          </header>
          <div>
            <strong>{{ payloadString('author') || 'TA' }}</strong>
            <small v-if="payloadString('date')">{{ payloadString('date') }}</small>
            <b v-if="payloadString('title')">{{ payloadString('title') }}</b>
            <p>{{ sharedFullText }}</p>
          </div>
          <footer v-if="canJumpToZone"><button type="button" @click="jumpToZone">前往原动态</button></footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { translateText } from '../../services/generation/translation';
import { ChatPreferencesSchema } from '../../services/chat/chat-preferences';
import { klona } from 'klona';
import { splitElectric } from '../../services/generation/electric';
import { usePhoneStore } from '../../stores/phone';
import { CharacterVoiceSchema, synthesizeSpeech } from '../../services/chat/speech';
import { distanceLabel, locationDistance } from '../../services/core/location';
import { displaySpeechText } from '../../services/chat/speech-tags';
import { computed, inject, onUnmounted, ref, watch } from 'vue';
import type { PhoneMessage } from '../../schemas';
import { phoneSurfaceKey } from '../../services/core/ui-context';

const videoElement = ref<HTMLVideoElement | null>(null);
const videoPlaying = ref(false);
const videoStarted = ref(false);
const videoError = ref('');
const videoPreview = ref(false);
async function playVideo(): Promise<void> {
  videoPreview.value = !videoPreview.value;
  if (videoElement.value) {
    try {
      videoError.value = '';
      await videoElement.value.play();
    } catch {
      videoError.value = '播放失败，请检查视频地址';
      videoPreview.value = true;
    }
  }
}

const props = withDefaults(defineProps<{ message: PhoneMessage; quotedText?: string }>(), { quotedText: '' });
const albumExpanded = ref(false);
const album = computed(() =>
  Array.isArray(props.message.payload.images)
    ? props.message.payload.images.filter((item): item is { url: string; description: string } =>
        Boolean(
          item &&
          typeof item === 'object' &&
          typeof (item as { url?: unknown }).url === 'string' &&
          /^(https?:\/\/|data:image\/)/i.test((item as { url: string }).url),
        ),
      )
    : [],
);
const transcriptOpen = ref(false);
const voicePlaying = ref(false);
const phone = usePhoneStore();
const surface = inject(phoneSurfaceKey, ref(null));
const electricText = computed(() =>
  [String(props.message.payload.electric || ''), splitElectric(props.message.content).electric]
    .filter(Boolean)
    .join('\n\n'),
);
const electricTitle = computed(() => {
  const payloadTitle = props.message.payload.electricTitle;
  return typeof payloadTitle === 'string' && payloadTitle.trim() ? payloadTitle.trim() : '查看 Ecot';
});
const preferences = computed(() => ChatPreferencesSchema.parse(phone.state.chatPreferences[phone.state.activeCharKey]));
const originalText = computed(() => {
  const stored = props.message.payload.originalText;
  const source = props.message.sender === 'user' && typeof stored === 'string' ? stored : props.message.content;
  return splitElectric(source).body;
});
const translation = computed(() => {
  const stored = typeof props.message.payload.translation === 'string' ? props.message.payload.translation : '';
  const legacyOriginal = props.message.payload.originalText;
  if (
    props.message.sender === 'user' &&
    typeof legacyOriginal === 'string' &&
    stored === legacyOriginal &&
    props.message.content !== legacyOriginal
  )
    return splitElectric(props.message.content).body;
  return stored;
});
const translationEnabled = computed(() =>
  props.message.sender === 'user' ? preferences.value.outgoingTranslation : preferences.value.autoTranslate,
);
const isTranslatedUserMessage = computed(() => props.message.sender === 'user' && Boolean(translation.value));
const primaryText = computed(() => (isTranslatedUserMessage.value ? translation.value : originalText.value));
const secondaryText = computed(() => (isTranslatedUserMessage.value ? originalText.value : translation.value));
const secondaryLabel = computed(() => (props.message.sender === 'user' ? '原文' : '翻译'));
const translationOpen = ref(preferences.value.expandTranslation && Boolean(translation.value));
watch(translation, (next, previous) => {
  if (next && !previous && preferences.value.expandTranslation) translationOpen.value = true;
});
const translationBusy = ref(false);
const translationError = ref(
  typeof props.message.payload.translationError === 'string' ? props.message.payload.translationError : '',
);
async function toggleTranslation() {
  if (translation.value) {
    translationOpen.value = !translationOpen.value;
    return;
  }
  const charKey = phone.state.activeCharKey;
  const messageId = props.message.id;
  const content = originalText.value;
  translationBusy.value = true;
  translationError.value = '';
  try {
    const result = await translateText(
      klona(phone.settings),
      content,
      props.message.sender === 'user' ? preferences.value.inputLanguage : preferences.value.sourceLanguage,
      props.message.sender === 'user'
        ? preferences.value.outgoingLanguage || preferences.value.sourceLanguage
        : preferences.value.targetLanguage,
    );
    if (charKey !== phone.state.activeCharKey || messageId !== props.message.id || content !== originalText.value)
      return;
    phone.saveTranslation(messageId, result.text, result.provider);
    translationOpen.value = true;
  } catch (e) {
    translationError.value = e instanceof Error ? e.message : '翻译失败，请重试';
  } finally {
    translationBusy.value = false;
  }
}
const voiceBusy = ref(false),
  voiceError = ref(''),
  actualDuration = ref(0);
let voiceAudio: HTMLAudioElement | undefined,
  voiceRequest: AbortController | undefined,
  voiceObjectUrl = '',
  voiceCacheKey = '';

function payloadString(key: string): string {
  const value = props.message.payload[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function payloadNumber(key: string): number {
  const value = Number(props.message.payload[key]);
  return Number.isFinite(value) ? value : 0;
}
function voiceSeconds(text: string): number {
  return _.clamp(Math.ceil(Array.from(text.trim()).length / 4), 1, 120);
}
function hashText(text: string): number {
  return Array.from(text).reduce((hash, character) => (hash * 31 + (character.codePointAt(0) || 0)) >>> 0, 2166136261);
}

const mediaDescription = computed(() => payloadString('description') || props.message.content);
const voiceTranscript = computed(() => payloadString('transcript') || props.message.content || '无转写内容');
const voiceDuration = computed(
  () => actualDuration.value || payloadNumber('duration') || voiceSeconds(voiceTranscript.value),
);
const amountText = computed(() => payloadNumber('amount').toFixed(2));
const safeMediaUrl = computed(() => {
  const value = payloadString('url');
  return /^https?:\/\//i.test(value) || /^data:(?:image|video)\//i.test(value) || value.startsWith('/') ? value : '';
});
const stickerUrl = computed(() => {
  const value = payloadString('stickerUrl') || payloadString('url');
  const markedSticker = payloadString('emojiType') === 'sticker' || Boolean(payloadString('stickerUrl'));
  return markedSticker && (/^https?:\/\//i.test(value) || value.startsWith('data:image/')) ? value : '';
});
const safeLinkUrl = computed(() => {
  const value = payloadString('url');
  return /^https?:\/\//i.test(value) ? value : '';
});
const linkHost = computed(() => {
  if (!safeLinkUrl.value) return '链接地址未提供';
  try {
    return new URL(safeLinkUrl.value).hostname;
  } catch {
    return safeLinkUrl.value;
  }
});
const forwardNote = computed(() => payloadString('forwardNote'));
const shareKind = computed(() => payloadString('shareKind') || 'zone');
const sharedFullText = computed(() => payloadString('postContent') || props.message.content);
const sharedSummary = computed(() => {
  const value = sharedFullText.value.replace(/\s+/g, ' ').trim();
  return value.length > 96 ? `${value.slice(0, 96)}…` : value;
});
const canJumpToZone = computed(() => shareKind.value === 'zone' && Boolean(payloadString('postId')));
const sharedDetailOpen = ref(false);
function jumpToZone(): void {
  const charKey = payloadString('sourceCharKey');
  const postId = payloadString('postId');
  if (charKey) phone.selectIdentity(charKey);
  sharedDetailOpen.value = false;
  phone.currentPage = 'zone';
  window.setTimeout(() => {
    const target = surface.value?.ownerDocument.getElementById(`wave-zone-post-${postId}`);
    if (target && surface.value?.contains(target)) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
const transferState = computed<'pending' | 'received' | 'refunded'>(() => {
  const state = payloadString('state').toLowerCase();
  if (['received', 'paid', 'accepted'].includes(state)) return 'received';
  if (['refunded', 'refund', 'returned'].includes(state)) return 'refunded';
  return 'pending';
});
const transferStateLabel = computed(
  () => ({ pending: '未收款', received: '已收款', refunded: '已退款' })[transferState.value],
);
const locationStyle = computed<Record<string, string>>(() => {
  const seed = hashText(`${props.message.id}:${payloadString('name') || props.message.content}`);
  return {
    '--map-x': `${24 + (seed % 52)}%`,
    '--map-y': `${25 + ((seed >>> 6) % 48)}%`,
    '--map-turn': `${-18 + ((seed >>> 12) % 36)}deg`,
    '--map-shift': `${10 + ((seed >>> 18) % 22)}%`,
  };
});
async function toggleVoice(): Promise<void> {
  transcriptOpen.value = true;
  if (voiceBusy.value) {
    voiceRequest?.abort();
    voiceBusy.value = false;
    return;
  }
  if (voicePlaying.value) {
    voiceAudio?.pause();
    return;
  }
  const voice = CharacterVoiceSchema.parse(phone.state.characterVoices[phone.state.activeCharKey]);
  const cacheKey = JSON.stringify([voiceTranscript.value, voice, phone.settings.voiceServices]);
  voiceError.value = '';
  const controller = new AbortController();
  voiceRequest = controller;
  try {
    if (!voiceAudio || cacheKey !== voiceCacheKey) {
      voiceBusy.value = true;
      const blob = await synthesizeSpeech(
        voiceTranscript.value,
        phone.settings.voiceServices,
        voice,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      voiceAudio?.pause();
      if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
      voiceObjectUrl = URL.createObjectURL(blob);
      voiceAudio = new Audio(voiceObjectUrl);
      voiceCacheKey = cacheKey;
      voiceAudio.onplay = () => (voicePlaying.value = true);
      voiceAudio.onpause = () => (voicePlaying.value = false);
      voiceAudio.onended = () => (voicePlaying.value = false);
      voiceAudio.onloadedmetadata = () => {
        if (Number.isFinite(voiceAudio!.duration)) actualDuration.value = Math.ceil(voiceAudio!.duration);
      };
      voiceAudio.onerror = () => {
        voicePlaying.value = false;
        voiceError.value = '音频加载失败，请重试';
      };
    }
    if (!controller.signal.aborted) await voiceAudio.play();
  } catch (error) {
    if (!controller.signal.aborted) voiceError.value = error instanceof Error ? error.message : '语音播放失败';
  } finally {
    if (voiceRequest === controller) voiceBusy.value = false;
  }
}
onUnmounted(() => {
  voiceRequest?.abort();
  voiceAudio?.pause();
  if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
});
</script>
