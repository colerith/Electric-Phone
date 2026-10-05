import { preparePhoneStorage } from './services/core/durable-storage';
import { createPinia } from 'pinia';
import { createApp, watch, type App as VueApp } from 'vue';
import { createScriptIdDiv, destroyScriptIdDiv, deteleportStyle, teleportStyle } from '../../script';
import App from './app.vue';
import './styles/base/style.scss';
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
let stopEntryWatch: (() => void) | null = null;
let vueApp: VueApp<Element> | null = null;
let buttonEvent: EventOnReturn | null = null;
let mountedRoot: HTMLElement | null = null;
let releaseViewport: (() => void) | null = null;
function cleanup(): void {
  stopEntryWatch?.();
  stopEntryWatch = null;
  releaseViewport?.();
  releaseViewport = null;
  buttonEvent?.stop();
  buttonEvent = null;
  vueApp?.unmount();
  vueApp = null;
  destroyScriptIdDiv();
  deteleportStyle();
  mountedRoot = null;
}

async function initialize(): Promise<void> {
  await preparePhoneStorage();
  cleanup();
  const $root = createScriptIdDiv().attr('id', ROOT_ID);
  $('body').append($root);
  mountedRoot = $root[0];
  releaseViewport = bindPhoneViewport(mountedRoot);

  const pinia = createPinia();
  vueApp = createApp(App);
  vueApp.use(pinia);
  vueApp.mount($root[0]);
  teleportStyle();

  const store = usePhoneStore(pinia);
  stopEntryWatch = watch(() => store.settings.appearance.quickReplyEntry, syncPhoneQuickReply, { immediate: true });
  buttonEvent = eventOn(getButtonEvent(PHONE_QUICK_REPLY_BUTTON), () => {
    store.isOpen = !store.isOpen;
  });
  console.info('[wave-phone] 脚本界面已挂载');
}

$(() => {
  void errorCatched(initialize)();
});

$(window).on('pagehide', cleanup);

import './styles/apps/browser.scss';
import './styles/apps/music.scss';
import './styles/apps/music-refinements.scss';

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
