<template>
  <Teleport :to="surface || 'body'" :disabled="!surface">
    <div
      class="wave-person-overlay"
      @click.self="$emit('close')"
      @keydown.esc.stop.prevent="$emit('close')"
      @keydown.tab="trapFocus"
    >
      <section
        ref="dialog"
        class="npc-profile-page wave-person-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <header class="wave-person-dialog-bar">
          <span>人物资料</span>
          <button ref="closeButton" type="button" aria-label="关闭人物资料" @click="$emit('close')">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>
        <div class="npc-profile-hero">
          <div class="npc-profile-avatar">
            <img v-if="avatar && !broken" :src="avatar" alt="" @error="broken = true" /><span v-else>{{
              name.slice(0, 1)
            }}</span>
          </div>
          <div>
            <strong :id="titleId" class="wave-person-name" role="heading" aria-level="2">{{ name }}</strong>
            <p v-if="account">账号：{{ account }}</p>
            <small>{{ isSelf ? '我的空间' : anonymous ? '来自匿名树洞' : contact ? '通讯录好友' : '来自空间' }}</small>
          </div>
        </div>
        <div class="wave-person-details">
          <div class="npc-profile-row">
            <span>关系</span
            ><b>{{
              isSelf
                ? '我自己'
                : anonymous
                  ? '匿名用户'
                  : contact?.relationshipToUser || (contact ? '通讯录联系人' : '尚未添加好友')
            }}</b>
          </div>
          <div class="npc-profile-about">
            <span>个人介绍</span>
            <p>{{ about }}</p>
          </div>
        </div>
        <button v-if="!isSelf && !anonymous && (contact || npc)" class="wave-person-action" type="button" @click="act">
          {{ contact ? '发消息' : '添加到通讯录' }}
        </button>
        <p v-if="notice" role="status" class="wave-person-note">{{ notice }}</p>
        <p v-if="!isSelf && !anonymous && (contact || npc)" class="wave-person-note">
          {{ contact ? '头像、关系与人设可在私聊设置里修改。' : '添加后可在联系人列表找到这位朋友。' }}
        </p>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, inject, ref, watch, onMounted, onUnmounted, useId } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { npcAvatarUrl } from '../../services/space/npc-avatar';
import { parseZonePage } from '../../services/space/zone';
import { displayIdentityName } from '../../services/core/identity';
import { phoneSurfaceKey } from '../../services/core/ui-context';
const props = withDefaults(
  defineProps<{
    npcId: string;
    fallbackName?: string;
    fallbackAvatar?: string;
    userName?: string;
    userAvatar?: string;
    anonymous?: boolean;
  }>(),
  { fallbackName: '', fallbackAvatar: '', userName: '', userAvatar: '', anonymous: false },
);
const emit = defineEmits<{ close: [] }>();
const phone = usePhoneStore(),
  broken = ref(false),
  notice = ref('');
const surface = inject(phoneSurfaceKey, ref(null));
const dialog = ref<HTMLElement | null>(null),
  closeButton = ref<HTMLButtonElement | null>(null);
const titleId = useId();
const isSelf = computed(() => !props.anonymous && props.npcId === 'user');
const npc = computed(() => (props.anonymous ? undefined : phone.state.moments.npcs[props.npcId]));
const contact = computed(() => (props.anonymous ? undefined : phone.state.identities[props.npcId]));
const profile = computed(() => parseZonePage(phone.state.snapshots[props.npcId]?.zone || '').profile);
const name = computed(() =>
  isSelf.value
    ? props.userName || phone.state.moments.profile.nickname || '我'
    : contact.value
      ? displayIdentityName(contact.value)
      : npc.value?.username || props.fallbackName || '空间访客',
);
const account = computed(() =>
  props.anonymous
    ? ''
    : isSelf.value
      ? phone.state.moments.profile.account
      : profile.value.handle || npc.value?.avatarSeed.replace('wave-', 'wave_') || '',
);
const about = computed(() =>
  props.anonymous
    ? '这位用户以匿名身份参与树洞，尚未留下个人介绍。'
    : isSelf.value
      ? phone.state.moments.profile.signature || '还没有填写个人介绍。'
      : contact.value?.npcProfile ||
        contact.value?.about ||
        npc.value?.profile ||
        profile.value.signature ||
        '这位朋友还没有留下介绍。',
);
const avatar = computed(() =>
  isSelf.value
    ? props.userAvatar || phone.state.moments.profile.avatar
    : contact.value?.avatar || (npc.value ? npcAvatarUrl(npc.value.avatarSeed) : props.fallbackAvatar),
);
watch(avatar, () => {
  broken.value = false;
});
let previous: HTMLElement | null = null;
onMounted(() => {
  previous = dialog.value?.ownerDocument.activeElement as HTMLElement | null;
  closeButton.value?.focus({ preventScroll: true });
});
onUnmounted(() => {
  if (previous?.isConnected) previous.focus({ preventScroll: true });
});
function trapFocus(event: KeyboardEvent): void {
  const buttons = Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
  const first = buttons[0],
    last = buttons.at(-1),
    active = dialog.value?.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || active === dialog.value)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}
function act(): void {
  try {
    if (contact.value) {
      phone.startConversation(props.npcId);
      phone.currentPage = 'conversation';
      emit('close');
    } else if (npc.value) {
      phone.addMomentNpc(props.npcId);
      notice.value = '已添加到通讯录';
    }
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
  }
}
</script>
<style lang="scss">
#wave-phone-script-root .wave-device {
  .wave-person-overlay {
    position: absolute;
    inset: 0;
    z-index: 160;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: #18223866;
    backdrop-filter: blur(5px);
    overscroll-behavior: contain;
  }
  .wave-person-dialog {
    display: block;
    position: relative;
    width: 100%;
    max-width: 360px;
    max-height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 18px;
    border: 1px solid var(--wave-line);
    border-radius: 24px;
    background: var(--wave-card, #fff);
    box-shadow: 0 18px 50px #14203833;
    color: var(--wave-ink, #374558);
    font: 400 13px/1.6 var(--wave-ui-font, sans-serif);
    text-shadow: none;
  }
  .wave-person-dialog-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    color: var(--wave-muted);
    font-size: 12px;
  }
  .wave-person-dialog button {
    appearance: none;
    margin: 0;
    border: 0;
    text-shadow: none;
    box-shadow: none;
    font-family: inherit;
    cursor: pointer;
  }
  .wave-person-dialog-bar button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 50%;
    background: var(--wave-tint);
    color: var(--wave-ink);
  }
  .npc-profile-hero {
    display: flex;
    gap: 14px;
    align-items: center;
    margin: 0 0 20px;
  }
  .npc-profile-hero > div:last-child {
    min-width: 0;
  }
  .wave-person-name {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
    color: var(--wave-ink) !important;
    -webkit-text-fill-color: currentColor !important;
    font: 650 19px/1.4 var(--wave-ui-font, sans-serif) !important;
    text-shadow: none !important;
    letter-spacing: normal !important;
    overflow-wrap: anywhere;
  }
  .wave-person-name::before,
  .wave-person-name::after {
    content: none !important;
  }
  .npc-profile-hero p {
    margin: 5px 0;
    overflow-wrap: anywhere;
    font-size: 11px;
    color: var(--wave-muted);
  }
  .npc-profile-hero small {
    font-size: 11px;
    color: var(--wave-muted);
  }
  .npc-profile-avatar {
    width: 64px;
    height: 64px;
    flex: 0 0 64px;
    overflow: hidden;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--wave-tint);
  }
  .npc-profile-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    object-fit: cover;
  }
  .wave-person-details {
    padding: 14px;
    border-radius: 16px;
    background: var(--wave-tint);
  }
  .npc-profile-row {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--wave-line);
  }
  .npc-profile-row b {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .npc-profile-about {
    padding-top: 12px;
  }
  .npc-profile-about p {
    margin: 6px 0 0;
    white-space: pre-wrap;
    line-height: 1.7;
    overflow-wrap: anywhere;
    color: var(--wave-muted);
  }
  .wave-person-dialog .wave-person-action {
    width: 100%;
    min-height: 42px;
    margin-top: 18px;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--wave-navy);
    color: #fff;
    font-size: 13px;
  }
  .wave-person-note {
    margin: 10px 0 0;
    color: var(--wave-muted);
    font-size: 11px;
  }
}
</style>
