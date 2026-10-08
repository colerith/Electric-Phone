import { preparePhoneStorage } from './services/core/durable-storage';
import { createPinia, disposePinia, type Pinia } from 'pinia';
import { createApp, watch, type App as VueApp } from 'vue';
import { createScriptIdDiv, destroyScriptIdDiv, deteleportStyle, teleportStyle } from './services/core/mount-root';
import { isExtensionRuntime } from './services/core/runtime';
import App from './app.vue';
import './styles/base/style.scss';
import './styles/base/floating-entry.scss';
import './styles/apps/apps.scss';
import './styles/apps/messages.scss';
import './styles/apps/memo.scss';
import './styles/base/interactions.scss';
import './styles/base/refinements.scss';
import './styles/apps/calendar.scss';
import { usePhoneStore } from './stores/phone';
import { bindPhoneViewport } from './services/core/viewport';
import { PHONE_QUICK_REPLY_BUTTON, syncPhoneQuickReply } from './services/core/entry-buttons';

const ROOT_ID = 'wave-phone-script-root';
let activePinia: Pinia | null = null;
let stopEntryWatch: (() => void) | null = null;
let vueApp: VueApp<Element> | null = null;
let buttonEvent: EventOnReturn | null = null;
let mountedRoot: HTMLElement | null = null;
let releaseViewport: (() => void) | null = null;
export function cleanup(): void {
  stopEntryWatch?.();
  stopEntryWatch = null;
  releaseViewport?.();
  releaseViewport = null;
  buttonEvent?.stop();
  buttonEvent = null;
  vueApp?.unmount();
  vueApp = null;
  if (activePinia) disposePinia(activePinia);
  activePinia = null;
  destroyScriptIdDiv();
  deteleportStyle();
  mountedRoot = null;
}

export function openPhone(): void {
  if (activePinia) usePhoneStore(activePinia).isOpen = true;
}

export async function initialize(): Promise<void> {
  if (
    !isExtensionRuntime &&
    window.parent.document.querySelector('#wave-phone-script-root[data-wave-runtime="extension"]')
  ) {
    toastr.warning('电波手机扩展已运行，请停用旧脚本');
    return;
  }
  await preparePhoneStorage();
  cleanup();
  const $root = createScriptIdDiv().attr('id', ROOT_ID);
  $('body').append($root);
  mountedRoot = $root[0];
  releaseViewport = bindPhoneViewport(mountedRoot);

  const pinia = createPinia();
  activePinia = pinia;
  vueApp = createApp(App);
  vueApp.use(pinia);
  vueApp.mount($root[0]);
  teleportStyle();

  const store = usePhoneStore(pinia);
  stopEntryWatch = watch(
    () => [store.settings.appearance.quickReplyEntry, store.settings.appearance.floatingEntry],
    ([quickReply, floating]) => {
      // Recover old/imported settings that otherwise leave no way into the phone.
      if (!quickReply && !floating) {
        store.settings.appearance.floatingEntry = true;
        store.saveSettings();
      }
      syncPhoneQuickReply(quickReply);
    },
    { immediate: true },
  );
  buttonEvent = eventOn(getButtonEvent(PHONE_QUICK_REPLY_BUTTON), () => {
    store.isOpen = !store.isOpen;
  });
  console.info(isExtensionRuntime ? '[wave-phone] 扩展界面已挂载' : '[wave-phone] 脚本界面已挂载');
}

if (!isExtensionRuntime)
  $(() => {
    void errorCatched(initialize)();
  });

$(window).on('pagehide', cleanup);

import './styles/apps/browser.scss';
import './styles/apps/music.scss';
import './styles/apps/music-refinements.scss';
import './styles/apps/music-accounts.scss';

import './styles/base/shell-refinements.scss';

import './styles/settings/settings.scss';

import './styles/base/greeting-font.scss';
import './styles/apps/home.scss';

import './styles/settings/system-settings.scss';

import './styles/apps/messenger.scss';

import './styles/apps/moments.scss';
import './styles/apps/space.scss';

import './styles/apps/presets.scss';
import './styles/base/compatibility.scss';
import './styles/base/select-unified.scss';
