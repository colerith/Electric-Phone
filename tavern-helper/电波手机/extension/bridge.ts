/** Lexical bindings for the extension build; never overwrite the host's globals. */
export function hostContext(): any {
  return (window as any).SillyTavern.getContext();
}
export function helper(): any {
  const value = (window as any).TavernHelper;
  if (!value?.getVariables) throw new Error('请先安装并启用酒馆助手');
  return value;
}
export const SillyTavern: any = new Proxy({}, { get: (_target, key) => hostContext()[key] });
export const tavern_events: any = new Proxy(
  {},
  { get: (_target, key) => helper().tavern_events?.[key] ?? hostContext().eventTypes[key] },
);
const subscriptions = new Set<() => void>();
export function eventOn(name: string, listener: (...args: any[]) => any) {
  const source = hostContext().eventSource;
  source.on(name, listener);
  const stop = () => {
    source.removeListener(name, listener);
    subscriptions.delete(stop);
  };
  subscriptions.add(stop);
  return { stop };
}
export function stopExtensionEvents() {
  for (const stop of [...subscriptions]) stop();
}
const EXTENSION_ID = 'wave_phone_extension';
const scope = (option: any) =>
  option?.type === 'script' && !option.script_id ? { type: 'extension', extension_id: EXTENSION_ID } : option;
export function getVariables(option: any) {
  return helper().getVariables(scope(option));
}
export function replaceVariables(value: any, option: any) {
  return helper().replaceVariables(value, scope(option));
}
export function getScriptId() {
  return EXTENSION_ID;
}
export const getButtonEvent = (_name: string) => 'wave-phone-extension:toggle';
let buttons: { name: string; visible: boolean }[] = [];
export function getScriptButtons() {
  return buttons.map(b => ({ ...b }));
}
export function replaceScriptButtons(value: typeof buttons) {
  buttons = value.map(b => ({ ...b }));
  const entry = document.getElementById('wave-phone-extension-menu');
  if (entry) entry.style.display = buttons.some(b => b.visible) ? '' : 'none';
}
export function legacyScripts(): any[] {
  const found: any[] = [];
  const visit = (nodes: any[], parentEnabled = true) =>
    nodes.forEach(node => {
      const active = parentEnabled && Boolean(node.enabled);
      if (node.type === 'folder') visit(node.scripts || [], active);
      else if (typeof node.content === 'string' && /colerith\/Electric-Phone|wave-phone-script-root/.test(node.content))
        found.push({ ...node, active });
    });
  for (const type of ['global', 'preset', 'character']) {
    try {
      visit(helper().getScriptTrees({ type }));
    } catch {
      /* no active character/preset */
    }
  }
  return [...new Map(found.map(row => [row.id, row])).values()];
}
export function migrateLegacyVariables() {
  const existing = getVariables({ type: 'script' });
  if (existing.__wave_migrated) return;
  const candidates = legacyScripts().filter(row => Object.keys(row.data || {}).some(k => k.startsWith('wave_phone')));
  // Ambiguous old installations are kept untouched; durable global/chat storage remains authoritative.
  const previous = candidates.length === 1 ? candidates[0].data : {};
  const values = Object.fromEntries(Object.entries(previous).filter(([key]) => key.startsWith('wave_phone')));
  replaceVariables({ ...values, ...existing, __wave_migrated: true }, { type: 'script' });
}
export const createPreset = (...args: any[]) => helper().createPreset(...args);
export const deletePreset = (...args: any[]) => helper().deletePreset(...args);
export const errorCatched = (...args: any[]) => helper().errorCatched(...args);
export const generate = (...args: any[]) => helper().generate(...args);
export const generateRaw = (...args: any[]) => helper().generateRaw(...args);
export const getCharAvatarPath = (...args: any[]) => helper().getCharAvatarPath(...args);
export const getCharData = (...args: any[]) => helper().getCharData(...args);
export const getCharWorldbookNames = (...args: any[]) => helper().getCharWorldbookNames(...args);
export const getChatMessages = (...args: any[]) => helper().getChatMessages(...args);
export const getTavernRegexes = (...args: any[]) => helper().getTavernRegexes(...args);
export const getWorldbook = (...args: any[]) => helper().getWorldbook(...args);
export const getWorldbookNames = (...args: any[]) => helper().getWorldbookNames(...args);
export const injectPrompts = (...args: any[]) => helper().injectPrompts(...args);
export const setChatMessages = (...args: any[]) => helper().setChatMessages(...args);
export const stopGenerationById = (...args: any[]) => helper().stopGenerationById(...args);
export const triggerSlash = (...args: any[]) => helper().triggerSlash(...args);
export const updateTavernRegexesWith = (...args: any[]) => helper().updateTavernRegexesWith(...args);
