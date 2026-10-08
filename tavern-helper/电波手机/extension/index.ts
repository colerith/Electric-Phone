import { WAVE_PHONE_RELEASE_VERSION } from '../schemas';
import { initialize, cleanup, openPhone } from '../index';
import { helper, legacyScripts, migrateLegacyVariables, stopExtensionEvents } from './bridge';

const EXTENSION_ID = 'wave-phone-extension-settings';
let starting = false,
  running = false,
  disposed = false;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let status: HTMLElement;
let refreshButton: HTMLButtonElement;
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
    const activeScripts = legacyScripts().filter(row => row.active);
    if (activeScripts.length) {
      setStatus(
        `旧电波手机脚本仍启用：${activeScripts.map(row => row.name || row.id).join('、')}。请在酒馆助手停用旧脚本，再点击打开。`,
      );
      return;
    }
    if (document.getElementById('wave-phone-script-root')) {
      setStatus(
        '当前页面仍残留另一份手机界面。停用或卸载旧脚本后，请刷新页面以释放旧脚本，再进入扩展版；无需清除缓存或删除存档。',
      );
      refreshButton.hidden = false;
      refreshButton.style.display = '';
      return;
    }
    refreshButton.hidden = true;
    refreshButton.style.display = 'none';
    migrateLegacyVariables();
    await initialize();
    if (disposed) {
      cleanup();
      return;
    }
    running = true;
    setStatus(`电波手机 v${WAVE_PHONE_RELEASE_VERSION} 扩展版已就绪`);
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
  panel.className = 'extension_container';
  const drawer = document.createElement('div');
  drawer.className = 'inline-drawer';
  const header = document.createElement('div');
  header.className = 'inline-drawer-toggle inline-drawer-header';
  const arrow = document.createElement('div');
  arrow.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
  const content = document.createElement('div');
  content.className = 'inline-drawer-content';
  const version = document.createElement('p');
  version.textContent = `扩展版本 v${WAVE_PHONE_RELEASE_VERSION}`;
  const heading = document.createElement('strong');
  heading.textContent = '📱 电波手机';
  status = document.createElement('p');
  status.textContent = '等待酒馆助手就绪…';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu_button';
  button.textContent = '打开电波手机 / 重试';
  button.onclick = () => void start(true);
  refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.className = 'menu_button';
  refreshButton.textContent = '刷新页面，加载扩展版';
  refreshButton.hidden = true;
  refreshButton.style.display = 'none';
  refreshButton.onclick = () => window.location.reload();
  header.append(heading, arrow);
  content.append(version, status, button, refreshButton);
  drawer.append(header, content);
  panel.append(drawer);
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
