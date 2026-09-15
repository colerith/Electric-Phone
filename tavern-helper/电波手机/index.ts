import { createPinia } from 'pinia';
import { createApp, watch, type App as VueApp, type WatchStopHandle } from 'vue';
import { createScriptIdDiv, destroyScriptIdDiv, deteleportStyle, teleportStyle } from '../../script';
import App from './app.vue';
import './style.scss';
import './apps.scss';
import './messages.scss';
import './memo.scss';
import './interactions.scss';
import './refinements.scss';
import './calendar.scss';
import { usePhoneStore } from './stores/phone';

const ROOT_ID = 'wave-phone-script-root';
const QUICK_REPLY_BUTTON = '📱 电波手机';
let vueApp: VueApp<Element> | null = null;
let buttonEvent: EventOnReturn | null = null;
let openWatcher: WatchStopHandle | null = null;
let mountedRoot: HTMLElement | null = null;
let phoneOwnsFullscreen = false;
let fullscreenRequestId = 0;

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function isMobileFullscreenLayout(root: HTMLElement): boolean {
  const view = root.ownerDocument.defaultView;
  if (!view) return false;
  return view.matchMedia('(max-width: 480px)').matches && view.matchMedia('(pointer: coarse)').matches;
}

function fullscreenElement(document: WebkitFullscreenDocument): Element | null {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function exitFullscreenDocument(document: WebkitFullscreenDocument): Promise<void> {
  const result = document.exitFullscreen
    ? document.exitFullscreen()
    : document.webkitExitFullscreen
      ? document.webkitExitFullscreen()
      : undefined;
  return Promise.resolve(result);
}

function requestMobileFullscreen(root: HTMLElement): void {
  const document = root.ownerDocument as WebkitFullscreenDocument;
  if (!isMobileFullscreenLayout(root) || fullscreenElement(document)) return;
  const element = root as WebkitFullscreenElement;
  const request = element.requestFullscreen
    ? () => element.requestFullscreen({ navigationUI: 'hide' })
    : element.webkitRequestFullscreen
      ? () => element.webkitRequestFullscreen?.()
      : null;
  if (!request) return;
  const requestId = ++fullscreenRequestId;
  try {
    void Promise.resolve(request())
      .then(() => {
        if (requestId !== fullscreenRequestId) {
          if (fullscreenElement(document) === root) void exitFullscreenDocument(document).catch(() => {});
          return;
        }
        phoneOwnsFullscreen = fullscreenElement(document) === root;
      })
      .catch(error => console.info('[wave-phone] 当前浏览器未允许隐藏原生状态栏', error));
  } catch (error) {
    console.info('[wave-phone] 当前浏览器未允许隐藏原生状态栏', error);
  }
}

function exitPhoneFullscreen(root: HTMLElement): void {
  const document = root.ownerDocument as WebkitFullscreenDocument;
  fullscreenRequestId += 1;
  if (!phoneOwnsFullscreen || fullscreenElement(document) !== root) {
    phoneOwnsFullscreen = false;
    return;
  }
  phoneOwnsFullscreen = false;
  if (!document.exitFullscreen && !document.webkitExitFullscreen) return;
  try {
    void exitFullscreenDocument(document).catch(error => console.info('[wave-phone] 退出原生全屏失败', error));
  } catch (error) {
    console.info('[wave-phone] 退出原生全屏失败', error);
  }
}

function cleanup(): void {
  openWatcher?.();
  openWatcher = null;
  buttonEvent?.stop();
  buttonEvent = null;
  if (mountedRoot) exitPhoneFullscreen(mountedRoot);
  vueApp?.unmount();
  vueApp = null;
  destroyScriptIdDiv();
  deteleportStyle();
  mountedRoot = null;
}

async function initialize(): Promise<void> {
  cleanup();
  const $root = createScriptIdDiv().attr('id', ROOT_ID);
  $('body').append($root);
  mountedRoot = $root[0];

  const pinia = createPinia();
  vueApp = createApp(App);
  vueApp.use(pinia);
  vueApp.mount($root[0]);
  teleportStyle();

  const store = usePhoneStore(pinia);
  openWatcher = watch(
    () => store.isOpen,
    open => {
      if (!open) exitPhoneFullscreen($root[0]);
    },
  );
  appendInexistentScriptButtons([{ name: QUICK_REPLY_BUTTON, visible: true }]);
  buttonEvent = eventOn(getButtonEvent(QUICK_REPLY_BUTTON), () => {
    const opening = !store.isOpen;
    if (opening) requestMobileFullscreen($root[0]);
    store.isOpen = opening;
  });
  console.info('[wave-phone] 脚本界面已挂载');
}

$(() => {
  void errorCatched(initialize)();
});

$(window).on('pagehide', cleanup);

import './browser.scss';
import './music.scss';
import './music-refinements.scss';

import './shell-refinements.scss';

import './settings.scss';

import './greeting-font.scss';
import './home.scss';

import './system-settings.scss';

import './messenger.scss';

import './moments.scss';

import './presets.scss';
