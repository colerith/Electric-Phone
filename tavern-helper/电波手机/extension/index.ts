import { initialize, cleanup, openPhone } from '../index';
import { helper, legacyScripts, migrateLegacyVariables, stopExtensionEvents } from './bridge';

const EXTENSION_ID = 'wave-phone-extension-settings';
let starting = false,
  running = false,
  disposed = false;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let status: HTMLElement;
function setStatus(text: string) {
  if (status) status.textContent = text;
}
async function start(open = false) {
  if (disposed || starting) return;
  if (running) {
    if (open) openPhone();
    return;
  }
  starting = true;
  try {
    helper();
    if (document.getElementById('wave-phone-script-root') || legacyScripts().some(row => row.active)) {
      setStatus('检测到旧电波手机脚本。请在酒馆助手停用旧脚本，再点击打开；不要删除存档。');
      return;
    }
    migrateLegacyVariables();
    await initialize();
    if (disposed) {
      cleanup();
      return;
    }
    running = true;
    setStatus('电波手机已就绪');
    if (open) openPhone();
  } catch (e) {
    cleanup();
    stopExtensionEvents();
    setStatus(e instanceof Error ? e.message : '启动失败，请检查依赖后重试');
    console.warn('[wave-phone] 扩展启动失败');
  } finally {
    starting = false;
  }
}
function installEntry() {
  if (document.getElementById(EXTENSION_ID)) return;
  const panel = document.createElement('div');
  panel.id = EXTENSION_ID;
  panel.className = 'inline-drawer';
  const heading = document.createElement('strong');
  heading.textContent = '📱 电波手机';
  status = document.createElement('p');
  status.textContent = '等待酒馆助手就绪…';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu_button';
  button.textContent = '打开电波手机 / 重试';
  button.onclick = () => void start(true);
  panel.append(heading, status, button);
  (
    document.getElementById('extensions_settings2') ||
    document.getElementById('extensions_settings') ||
    document.body
  ).append(panel);
  const menu = document.getElementById('extensionsMenu');
  if (menu) {
    const entry = document.createElement('div');
    entry.id = 'wave-phone-extension-menu';
    entry.className = 'list-group-item flex-container flexGap5';
    entry.tabIndex = 0;
    entry.setAttribute('role', 'button');
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-mobile-screen-button extensionsMenuExtensionButton';
    const label = document.createElement('span');
    label.textContent = '电波手机';
    entry.append(icon, label);
    entry.onclick = () => void start(true);
    entry.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void start(true);
      }
    };
    menu.append(entry);
  }
  const deadline = Date.now() + 30000;
  const waitForHelper = () => {
    if (disposed) return;
    if ((window as any).TavernHelper?.getVariables && (window as any).SillyTavern?.getContext) {
      void start();
      return;
    }
    if (Date.now() >= deadline) {
      setStatus('未检测到酒馆助手。请启用酒馆助手 4.x 后刷新，或点击重试。');
      return;
    }
    readyTimer = setTimeout(waitForHelper, 250);
  };
  waitForHelper();
}
$(() => installEntry());
window.addEventListener(
  'pagehide',
  () => {
    disposed = true;
    clearTimeout(readyTimer);
    cleanup();
    stopExtensionEvents();
    document.getElementById(EXTENSION_ID)?.remove();
    document.getElementById('wave-phone-extension-menu')?.remove();
  },
  { once: true },
);
