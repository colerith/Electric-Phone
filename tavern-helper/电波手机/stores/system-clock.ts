import { readPhoneChatTime } from '../services/core/chat-time';
import { registerMessageClock } from '../services/core/message-clock';
import { computed, ref, watch, onScopeDispose } from 'vue';
import { defineStore } from 'pinia';
import { usePhoneStore } from './phone';
import {
  clockLabels,
  observeBaiBaiTime,
  readBaiBaiTime,
  parseCivilTime,
  resolveClock,
} from '../services/core/system-clock';

type BaiBaiHost = Window & { STBaiBaiBook?: { getSnapshot(): { chat?: { id?: string }; state?: { time?: string } } } };
export const useSystemClockStore = defineStore('wave-system-clock', () => {
  const phone = usePhoneStore();
  const now = ref(Date.now()),
    storyTime = ref(''),
    status = ref('等待柏宝书时间');
  const value = computed(() => resolveClock(phone.settings.basic.systemClock, now.value, storyTime.value));
  const labels = computed(() => clockLabels(value.value));
  const civilDate = computed(() => {
    if (value.value === null) return null;
    const date = new Date(value.value);
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    );
  });
  let host: BaiBaiHost | null = null,
    timer: ReturnType<typeof setInterval> | undefined,
    unobserve: (() => void) | undefined;
  let namespace = '',
    blocked: ReturnType<typeof readBaiBaiTime> = null;
  let lastDom: ReturnType<typeof readBaiBaiTime> = null;
  const cache = new Map<string, string>();
  const apiTimes = new Map<string, string>();
  let lastApiRead = 0;
  function currentNamespace() {
    const card = SillyTavern.groupId ? `group:${SillyTavern.groupId}` : `character:${SillyTavern.characterId ?? ''}`;
    return `${card}::${SillyTavern.getCurrentChatId() || ''}`;
  }
  function refresh(force = true) {
    now.value = Date.now();
    if (!host) return;
    const next = currentNamespace();
    if (next !== namespace) {
      blocked = namespace ? lastDom : null;
      namespace = next;
      storyTime.value = cache.get(next) || '';
      lastApiRead = 0;
    }
    if (phone.settings.basic.systemClock.source === 'phone') {
      storyTime.value = readPhoneChatTime();
      status.value = storyTime.value ? '已同步本聊天时间戳 · 不自动走时' : '尚无有效时间戳，可设置起始时间后继续聊天';
      return;
    }
    const dom = readBaiBaiTime(host.document);
    if (dom) lastDom = dom;
    if (phone.settings.basic.systemClock.source !== 'baibai') return;
    if (!SillyTavern.getCurrentChatId()) {
      storyTime.value = '';
      status.value = '请先打开角色聊天';
      return;
    }
    let text = dom && (dom.element !== blocked?.element || dom.text !== blocked?.text) ? dom.text : '';
    if ((text && text !== storyTime.value) || (!text && (force || now.value - lastApiRead >= 5000))) {
      try {
        lastApiRead = now.value;
        const snapshot = host.STBaiBaiBook?.getSnapshot();
        if (
          String(snapshot?.chat?.id) === String(SillyTavern.getCurrentChatId()) &&
          parseCivilTime(snapshot?.state?.time || '') !== null
        ) {
          const apiTime = snapshot!.state!.time!;
          // The summary page can be ahead of summarized memory. Closing it must not rewind its time.
          if (!text && (!storyTime.value || apiTimes.get(namespace) !== apiTime)) text = apiTime;
          apiTimes.set(namespace, apiTime);
        }
      } catch {
        /* Older versions may expose no API while their panel is closed. */
      }
    }
    if (text) {
      storyTime.value = text;
      cache.set(namespace, text);
      status.value = dom?.text === text ? '已同步柏宝书当前时间 · 不自动走时' : '已同步柏宝书时间 · 不自动走时';
    } else status.value = storyTime.value ? '暂未读到新时间，保持本聊天上次时间' : '等待柏宝书时间，请打开柏宝书摘要页';
  }
  onScopeDispose(
    registerMessageClock(() => {
      refresh(false);
      return civilDate.value;
    }),
  );
  function start(target: Window) {
    stop();
    host = target as BaiBaiHost;
    refresh();
    unobserve = observeBaiBaiTime(host, () => refresh());
    timer = setInterval(() => refresh(false), 1000);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    unobserve?.();
    unobserve = undefined;
    host = null;
  }
  watch(
    () => phone.settings.basic.systemClock,
    () => refresh(),
    { deep: true },
  );
  return { value, labels, civilDate, status, refresh, start, stop };
});
