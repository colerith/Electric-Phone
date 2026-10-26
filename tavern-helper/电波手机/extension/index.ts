import { setPhoneActive } from '../services/core/phone-activity';
import { WAVE_PHONE_RELEASE_VERSION } from '../schemas';
import { initialize, cleanup, openPhone } from '../index';
import { helper, legacyScripts, migrateLegacyVariables, stopExtensionEvents } from './bridge';

const EXTENSION_ID = 'wave-phone-extension-settings';
let starting = false,
  running = false,
  disposed = false;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let enabled = true;
let activation = 0;
let status: HTMLElement;
let openButton: HTMLButtonElement;
const ENABLED_KEY = 'wave_phone_enabled';
function readEnabled(): boolean {
  const context = (window as any).SillyTavern?.getContext?.();
  if (typeof context?.extensionSettings?.[ENABLED_KEY] === 'boolean') return context.extensionSettings[ENABLED_KEY];
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}
function toggleEnabled(value: boolean): void {
  enabled = value;
  activation++;
  setPhoneActive(value);
  const context = (window as any).SillyTavern?.getContext?.();
  if (context?.extensionSettings) {
    context.extensionSettings[ENABLED_KEY] = value;
    context.saveSettingsDebounced?.();
  }
  try {
    localStorage.setItem(ENABLED_KEY, String(value));
  } catch {
    /* host settings remain authoritative */
  }
  openButton.hidden = !value;
  openButton.style.display = value ? '' : 'none';
  if (!value) {
    clearTimeout(readyTimer);
    refreshButton.hidden = true;
    refreshButton.style.display = 'none';
    cleanup();
    stopExtensionEvents();
    running = false;
    setStatus('电波手机已关闭：入口与生成任务已停用，存档和设置保留');
  } else if (!starting) void start();
}

let refreshButton: HTMLButtonElement;
function setStatus(text: string) {
  if (status) status.textContent = text;
}
async function start(open = false) {
  if (disposed || starting || !enabled) return;
  const token = activation;
  if (running) {
    if (open) openPhone();
    return;
  }
  starting = true;
  let stage = '检查酒馆助手';
  try {
    helper();
    stage = '检查旧脚本';
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
    stage = '迁移旧脚本变量';
    migrateLegacyVariables();
    await initialize(
      value => {
        stage = value;
      },
      () => enabled && token === activation && !disposed,
    );
    if (disposed || !enabled || token !== activation) {
      cleanup();
      return;
    }
    running = true;
    setStatus(`电波手机 v${WAVE_PHONE_RELEASE_VERSION} 扩展版已就绪`);
    if (open) openPhone();
  } catch (e) {
    cleanup();
    stopExtensionEvents();
    const detail = e instanceof Error ? e.message : '未知错误';
    setStatus(`启动失败（${stage}）：${detail}。原存档未重置；请保留此提示并查看控制台调用栈。`);
    console.warn(`[wave-phone] 扩展启动失败（${stage}）`, e instanceof Error ? e.stack : detail);
  } finally {
    starting = false;
    if (enabled && !disposed && token !== activation) void start();
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
  heading.textContent = '电波手机';
  status = document.createElement('p');
  status.textContent = '等待酒馆助手就绪…';
  enabled = readEnabled();
  setPhoneActive(enabled);
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'checkbox_label';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = enabled;
  toggle.setAttribute('aria-label', '启用电波手机');
  toggle.onchange = () => toggleEnabled(toggle.checked);
  toggleLabel.append(toggle, document.createTextNode('启用电波手机'));
  const button = document.createElement('button');
  openButton = button;
  button.hidden = !enabled;
  button.style.display = enabled ? '' : 'none';
  button.type = 'button';
  button.className = 'menu_button';
  button.textContent = '打开电波手机 / 重试';
  Object.assign(button.style, {
    width: 'fit-content',
    maxWidth: '100%',
    whiteSpace: 'normal',
    wordBreak: 'keep-all',
    flexShrink: '0',
  });
  button.onclick = () => void start(true);
  refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.className = 'menu_button';
  refreshButton.textContent = '刷新页面，加载扩展版';
  Object.assign(refreshButton.style, {
    width: 'fit-content',
    maxWidth: '100%',
    whiteSpace: 'normal',
    wordBreak: 'keep-all',
    flexShrink: '0',
  });
  refreshButton.hidden = true;
  refreshButton.style.display = 'none';
  refreshButton.onclick = () => window.location.reload();
  // Host themes may force every menu_button to icon width or vertical writing.
  for (const control of [button, refreshButton]) {
    for (const [key, value] of Object.entries({
      width: 'auto',
      'min-width': '0',
      'max-width': '100%',
      height: 'auto',
      'writing-mode': 'horizontal-tb',
      'text-orientation': 'mixed',
      'white-space': 'normal',
      'word-break': 'normal',
      'overflow-wrap': 'break-word',
      'flex-shrink': '0',
      'box-sizing': 'border-box',
      padding: '8px 12px',
    }))
      control.style.setProperty(key, value, 'important');
  }
  header.append(heading, arrow);
  content.append(version, toggleLabel, status, button, refreshButton);
  drawer.append(header, content);
  panel.append(drawer);
  (
    document.getElementById('extensions_settings2') ||
    document.getElementById('extensions_settings') ||
    document.body
  ).append(panel);
  const deadline = Date.now() + 30000;
  const waitForHelper = () => {
    if (disposed || !enabled) {
      if (!enabled) setStatus('电波手机已关闭：入口与生成任务已停用，存档和设置保留');
      return;
    }
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
