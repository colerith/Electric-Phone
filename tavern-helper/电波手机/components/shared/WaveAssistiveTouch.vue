<template>
  <div class="assistive-layer" @keydown.esc.stop.prevent="close">
    <button
      ref="ball"
      class="assistive-ball"
      :class="{ dragging, expanded: opened }"
      :style="ballStyle"
      type="button"
      aria-label="辅助触控"
      :aria-expanded="opened"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="cancelDrag"
      @click="activate"
    >
      <span aria-hidden="true"></span>
    </button>
    <div v-if="opened" class="assistive-shade" @click.self="close">
      <section
        ref="dialog"
        class="assistive-menu"
        role="dialog"
        aria-modal="true"
        aria-label="辅助触控菜单"
        tabindex="-1"
        @keydown.tab="trapFocus"
      >
        <header>
          <button v-if="page !== 'home'" type="button" aria-label="返回辅助触控首页" @click="page = 'home'">‹</button
          ><strong>{{ titles[page] }}</strong
          ><button type="button" aria-label="关闭辅助触控" @click="close">×</button>
        </header>
        <div v-if="page === 'home'" class="assistive-grid">
          <button v-for="item in entries" :key="item.page" type="button" @click="page = item.page">
            <i :class="item.icon" aria-hidden="true"></i><b>{{ item.label }}</b
            ><small>{{ item.detail }}</small>
          </button>
          <button
            type="button"
            @click="
              phone.currentPage = 'home';
              close();
            "
          >
            <i class="fa-solid fa-house" aria-hidden="true"></i><b>主屏幕</b><small>返回手机桌面</small>
          </button>
        </div>
        <div v-else-if="page === 'characters'" class="assistive-body">
          <p>切换后，各 App 跟随当前主角色。</p>
          <button
            v-for="actor in phone.panelCharacters"
            :key="actor.charKey"
            class="assistive-actor"
            type="button"
            :aria-pressed="phone.state.activeCharKey === actor.charKey"
            @click="phone.selectIdentity(actor.charKey)"
          >
            <img v-if="actor.avatar" :src="actor.avatar" alt="" /><span v-else class="assistive-avatar">{{
              actor.name.slice(0, 1)
            }}</span
            ><b>{{ actor.name }}</b
            ><span v-if="phone.state.activeCharKey === actor.charKey">✓</span>
          </button>
          <p v-if="!phone.panelCharacters.length">当前没有可切换的主角色。</p>
        </div>
        <div v-else-if="page === 'translation'" class="assistive-body">
          <p>私聊设置属于当前角色；App 独立设置沿用原有作用范围。关闭跟随私聊后，可单独配置。</p>
          <label
            >应用<select v-model="translationApp" aria-label="快捷翻译应用">
              <option value="messages">私聊 · {{ phone.activeIdentity?.name || '未选择角色' }}</option>
              <option value="memo">备忘</option>
              <option value="browse">浏览</option>
              <option value="moments">空间 / 树洞</option>
            </select></label
          >
          <template v-if="translationApp === 'messages'">
            <p v-if="!phone.activeIdentity">请先选择角色。</p>
            <template v-else>
              <label
                >自动附带译文<input
                  type="checkbox"
                  :checked="chatPrefs.autoTranslate"
                  @change="updateChat({ autoTranslate: checked($event) })"
              /></label>
              <label
                >自动展开译文<input
                  type="checkbox"
                  :checked="chatPrefs.expandTranslation"
                  @change="updateChat({ expandTranslation: checked($event) })"
              /></label>
              <label
                >原文语言<select
                  :value="chatPrefs.sourceLanguage"
                  @change="updateChat({ sourceLanguage: value($event) })"
                >
                  <option v-for="language in translationLanguages" :key="language.value" :value="language.value">
                    {{ language.label }}
                  </option>
                </select></label
              >
              <label
                >译文语言<select
                  :value="chatPrefs.targetLanguage"
                  @change="updateChat({ targetLanguage: value($event) })"
                >
                  <option v-for="language in translationLanguages" :key="language.value" :value="language.value">
                    {{ language.label }}
                  </option>
                </select></label
              >
              <label
                >发送前翻译<input
                  type="checkbox"
                  :checked="chatPrefs.outgoingTranslation"
                  @change="updateChat({ outgoingTranslation: checked($event) })"
              /></label>
              <label v-if="chatPrefs.outgoingTranslation"
                >发送目标语言<select
                  :value="chatPrefs.outgoingLanguage || chatPrefs.sourceLanguage"
                  @change="updateChat({ outgoingLanguage: value($event) })"
                >
                  <option v-for="language in translationLanguages" :key="language.value" :value="language.value">
                    {{ language.label }}
                  </option>
                </select></label
              >
            </template>
          </template>
          <template v-else>
            <label
              >跟随当前私聊<input
                type="checkbox"
                :checked="modulePrefs.syncChat"
                @change="updateModule({ syncChat: checked($event) })"
            /></label>
            <p v-if="modulePrefs.syncChat">
              {{
                chatPrefs.autoTranslate
                  ? `${chatPrefs.sourceLanguage} → ${chatPrefs.targetLanguage}`
                  : '当前私聊未开启翻译'
              }}
            </p>
            <template v-else>
              <label
                >自动附带译文<input
                  type="checkbox"
                  :checked="modulePrefs.autoTranslate"
                  @change="updateModule({ autoTranslate: checked($event) })"
              /></label>
              <label
                >自动展开译文<input
                  type="checkbox"
                  :checked="modulePrefs.expandTranslation"
                  @change="updateModule({ expandTranslation: checked($event) })"
              /></label>
              <label
                >原文语言<select
                  :value="modulePrefs.sourceLanguage"
                  @change="updateModule({ sourceLanguage: value($event) })"
                >
                  <option v-for="language in translationLanguages" :key="language.value" :value="language.value">
                    {{ language.label }}
                  </option>
                </select></label
              >
              <label
                >译文语言<select
                  :value="modulePrefs.targetLanguage"
                  @change="updateModule({ targetLanguage: value($event) })"
                >
                  <option v-for="language in translationLanguages" :key="language.value" :value="language.value">
                    {{ language.label }}
                  </option>
                </select></label
              >
            </template>
          </template>
          <small
            >设置即时保存。仅影响后续生成及已有译文展示，不会自动重译旧内容。状态、日历、音乐和钱包目前没有独立双语开关；群聊仍按各成员语言设置。</small
          >
        </div>
        <div v-else class="assistive-body">
          <p>统一选定账本的余额和流水币种，金额数字不变，不做汇率换算。</p>
          <label
            >应用范围<select v-model="walletScope" aria-label="钱包设置范围">
              <option value="current">当前显示账户</option>
              <option value="user">我的钱包</option>
              <option value="all">所有可见钱包</option>
            </select></label
          >
          <label
            >目标币种<select v-model="currency" aria-label="快捷钱包币种">
              <option v-for="code in currencies" :key="code" :value="code">{{ code }}</option>
            </select></label
          >
          <p>
            将修改 {{ walletTargets.length }} 个账户：{{ walletTargets.map(a => a.name).join('、') || '无可用账户' }}
          </p>
          <button class="assistive-primary" type="button" :disabled="!walletTargets.length" @click="applyCurrency">
            统一币种（金额不变）
          </button>
          <small>同一账户含多币种时，按原数字合并余额与流水。修改前数据保留在账户备份中。</small>
          <button v-if="undoState" type="button" @click="undoCurrency">撤销本次币种统一</button>
          <p v-if="notice" role="status">{{ notice }}</p>
          <button
            type="button"
            @click="
              phone.currentPage = 'wallet';
              close();
            "
          >
            打开钱包
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { ChatPreferencesSchema, type ChatPreferences } from '../../services/chat/chat-preferences';
import { translationLanguages } from '../../services/generation/translation';
import { currencies } from '../../services/wallet/wallet-accounts';
const phone = usePhoneStore();
const ball = ref<HTMLButtonElement>(),
  dialog = ref<HTMLElement>();
const opened = ref(false),
  dragging = ref(false),
  page = ref<'home' | 'characters' | 'translation' | 'wallet'>('home');
const titles = { home: '辅助触控', characters: '切换角色', translation: '快捷翻译', wallet: '钱包设置' };
const entries = [
  { page: 'characters' as const, label: '角色', detail: '切换主要 char', icon: 'fa-solid fa-user-group' },
  { page: 'translation' as const, label: '翻译', detail: '按 App 调整', icon: 'fa-solid fa-language' },
  { page: 'wallet' as const, label: '钱包', detail: '统一币种', icon: 'fa-solid fa-wallet' },
];
const position = computed(() => phone.settings.appearance.assistivePosition);
const dragPoint = ref<{ x: number; y: number } | null>(null);
const ballStyle = computed(() => ({
  left: dragPoint.value
    ? `calc(${dragPoint.value.x * 100}% - 26px)`
    : position.value.edge === 'left'
      ? '-18px'
      : 'calc(100% - 34px)',
  top: `calc(64px + (100% - 164px) * ${dragPoint.value?.y ?? position.value.y})`,
}));
let gesture: { x: number; y: number; rect: DOMRect; moved: boolean; id: number } | undefined;
let suppressClick = false;
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !ball.value) return;
  const parent = ball.value.closest('.wave-device');
  if (!parent) return;
  gesture = {
    x: event.clientX,
    y: event.clientY,
    rect: parent.getBoundingClientRect(),
    moved: false,
    id: event.pointerId,
  };
  ball.value.setPointerCapture?.(event.pointerId);
}
function moveDrag(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6 && !gesture.moved) return;
  gesture.moved = true;
  dragging.value = true;
  const scale =
    gesture.rect.height / ((ball.value?.closest('.wave-device') as HTMLElement)?.offsetHeight || gesture.rect.height);
  const localY = (event.clientY - gesture.rect.top) / scale;
  dragPoint.value = {
    x: Math.max(0.06, Math.min(0.94, (event.clientX - gesture.rect.left) / gesture.rect.width)),
    y: Math.max(0, Math.min(1, (localY - 90) / Math.max(1, gesture.rect.height / scale - 164))),
  };
}
function endDrag(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  suppressClick = gesture.moved;
  if (dragPoint.value) {
    phone.settings.appearance.assistivePosition = {
      edge: dragPoint.value.x < 0.5 ? 'left' : 'right',
      y: dragPoint.value.y,
    };
    phone.saveSettings();
  }
  gesture = undefined;
  dragPoint.value = null;
  dragging.value = false;
}
function cancelDrag() {
  gesture = undefined;
  dragPoint.value = null;
  dragging.value = false;
  suppressClick = true;
}
async function activate(event: MouseEvent) {
  if (suppressClick && event.detail !== 0) {
    suppressClick = false;
    return;
  }
  suppressClick = false;
  opened.value = !opened.value;
  page.value = 'home';
  if (opened.value) {
    await nextTick();
    dialog.value?.focus();
  }
}
function close() {
  opened.value = false;
  void nextTick(() => ball.value?.focus());
}
function trapFocus(event: KeyboardEvent) {
  const nodes = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input') || []);
  const first = nodes[0],
    last = nodes.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
const translationApp = ref<'messages' | 'memo' | 'browse' | 'moments'>('messages');
const chatPrefs = computed(() => ChatPreferencesSchema.parse(phone.state.chatPreferences[phone.state.activeCharKey]));
const modulePrefs = computed(() =>
  translationApp.value === 'moments'
    ? phone.state.moments.settings
    : phone.settings.moduleSettings[translationApp.value === 'browse' ? 'browse' : 'memo'],
);
function checked(event: Event) {
  return (event.target as HTMLInputElement).checked;
}
function value(event: Event) {
  return (event.target as HTMLSelectElement).value;
}
function updateChat(patch: Partial<ChatPreferences>) {
  if (!phone.activeIdentity) return;
  phone.state.chatPreferences[phone.state.activeCharKey] = { ...chatPrefs.value, ...patch };
  phone.saveChat();
}
function updateModule(patch: Partial<typeof modulePrefs.value>) {
  Object.assign(modulePrefs.value, patch);
  if (translationApp.value === 'moments') {
    Object.assign(phone.settings.moduleSettings.zone, patch);
    phone.saveMomentSettings(phone.state.moments.settings);
    phone.saveMoments();
  }
  phone.saveSettings();
}
const walletScope = ref('current'),
  currency = ref('CNY'),
  notice = ref('');
const walletTargets = computed(() =>
  phone.walletAccounts.filter(
    a =>
      walletScope.value === 'all' || a.id === (walletScope.value === 'user' ? 'user' : phone.selectedWalletAccount?.id),
  ),
);
const undoState = ref<{ chatKey: string; expected: Record<string, string> } | null>(null);
function undoCurrency() {
  try {
    if (!undoState.value || undoState.value.chatKey !== phone.state.chatKey) throw Error('聊天已切换，无法撤销此操作');
    phone.undoUnifiedWalletCurrencies(undoState.value.expected);
    undoState.value = null;
    notice.value = '已恢复修改前的币种与金额';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
  }
}
function applyCurrency() {
  try {
    phone.unifyWalletCurrencies(
      walletTargets.value.map(account => account.id),
      currency.value,
    );
    undoState.value = {
      chatKey: phone.state.chatKey,
      expected: Object.fromEntries(walletTargets.value.map(account => [account.id, JSON.stringify(account)])),
    };
    notice.value = `已统一 ${walletTargets.value.length} 个账户的币种，金额数字未换算`;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
  }
}
</script>
<style scoped lang="scss">
.assistive-layer {
  position: absolute;
  inset: 0;
  z-index: 180;
  pointer-events: none;
  border-radius: inherit;
  overflow: hidden;
  color: var(--assist-fg, #f5f6fa);
  font-family: system-ui, sans-serif;
}
.assistive-ball {
  pointer-events: auto;
  position: absolute;
  width: 52px;
  height: 52px;
  border: 1px solid #ffffff35;
  border-radius: 17px;
  background: #303744b8;
  backdrop-filter: blur(16px);
  display: grid;
  place-items: center;
  touch-action: none;
  cursor: grab;
  opacity: 0.55;
  transition:
    opacity 0.2s,
    left 0.2s;
  box-shadow: 0 2px 10px #0003;
  padding: 0;
}
.assistive-ball span {
  width: 31px;
  height: 31px;
  border-radius: 50%;
  border: 4px solid #dddfe6;
  background: #f8f9fc;
  box-shadow: 0 0 0 4px #ffffff26;
}
.assistive-ball:hover,
.assistive-ball:focus-visible,
.assistive-ball.dragging {
  opacity: 1;
}
.assistive-ball.dragging {
  transition: none;
  cursor: grabbing;
}
.assistive-shade {
  pointer-events: auto;
  position: absolute;
  inset: 0;
  background: #080e1838;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
}
.assistive-menu {
  width: 100%;
  max-width: 360px;
  max-height: 78%;
  overflow: auto;
  overscroll-behavior: contain;
  background: #252c39ed;
  backdrop-filter: blur(24px);
  border: 1px solid #ffffff24;
  border-radius: 28px;
  box-shadow: 0 16px 50px #0004;
  padding: 18px;
  box-sizing: border-box;
  color: #f5f6fa;
}
.assistive-menu header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.assistive-menu header strong {
  flex: 1;
  font-size: 18px;
}
.assistive-menu button {
  font: inherit;
  color: inherit;
  background: #ffffff12;
  border: 0;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
}
.assistive-menu header button {
  min-width: 38px;
  font-size: 23px;
  padding: 3px;
}
.assistive-menu button:focus-visible,
.assistive-menu select:focus-visible {
  outline: 2px solid #a9c6ff;
  outline-offset: 2px;
}
.assistive-menu button:disabled {
  opacity: 0.4;
  cursor: default;
}
.assistive-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.assistive-grid button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 8px;
}
.assistive-grid i {
  font-size: 27px;
  color: #bed2ff;
}
.assistive-menu small,
.assistive-menu p {
  font-size: 12px;
  line-height: 1.65;
  color: #b8c3d7;
}
.assistive-grid small {
  font-size: 11px;
}
.assistive-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.assistive-body p {
  margin: 0;
}
.assistive-body label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.assistive-body select {
  max-width: 62%;
  min-width: 0;
  background: #363f50;
  color: #fff;
  border: 1px solid #ffffff24;
  border-radius: 9px;
  padding: 8px;
  font: inherit;
}
.assistive-body input[type='checkbox'] {
  width: 19px;
  height: 19px;
  accent-color: #99baff;
  flex: none;
}
.assistive-actor {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.assistive-actor b {
  flex: 1;
}
.assistive-actor img,
.assistive-avatar {
  width: 38px;
  height: 38px;
  object-fit: cover;
  border-radius: 50%;
}
.assistive-avatar {
  display: grid;
  place-items: center;
  background: #7089af;
}
.assistive-actor[aria-pressed='true'] {
  background: #6689cb55;
  box-shadow: inset 0 0 0 1px #a6c1f5;
}
.assistive-menu .assistive-primary {
  background: #6689cb;
  color: white;
}
</style>
