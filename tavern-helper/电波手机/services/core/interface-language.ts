import { watch, onScopeDispose, type Ref } from 'vue';
import * as OpenCC from 'opencc-js/cn2t';
import localeData from './ui-locales.json';
const dictionaries: Record<string, Record<string, string>> = localeData;

export type InterfaceLanguage = '简体中文' | '繁体中文' | '英语' | '日语' | '韩语';
const codes = { 英语: 'en', 日语: 'ja', 韩语: 'ko' } as const;
const traditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
// Only bundled UI phrases are translated. Never send chat data to a translation service.
export function interfaceText(text: string, language: InterfaceLanguage): string {
  const key = normalize(text);
  if (language === '简体中文') return text;
  const translate = (part: string) => {
    if (!(part in dictionaries.en)) return part;
    return language === '繁体中文' ? traditional(part) : dictionaries[codes[language]]?.[part] || part;
  };
  if (key in dictionaries.en) return text.replace(text.trim(), translate(key));
  // Static fragments around counters remain translatable; numbers are not rewritten.
  return text.replace(/[\u3400-\u9fff]+/g, translate);
}
const protectedContent = [
  '[data-no-ui-translate]',
  '[contenteditable="true"]',
  'textarea',
  'input',
  'pre',
  'code',
  '.memo-paper-title',
  '.memo-paper-copy',
  '.memo-doodle',
  '.message-content',
  '.message-bubble',
  '.chat-bubble',
  '.status-profile-name',
  '.status-thought-body',
  '.status-mood-chip',
  '.status-organ',
  '.moment-content',
  '.moment-text',
  '.zone-post-content',
  '.comment-content',
  '.browser-note-content',
  '.calendar-event-content',
  '.music-lyrics',
  '.lyrics',
  '.track-title',
  '.contact-name',
  '.profile-name',
  '.zone-post-title',
  '.moment-title',
  '.page-conversation .wave-page-title',
  '.calendar-timeline-event p',
  '.assistive-actor b',
  '.calendar-timeline-event > strong',
].join(',');
const uiContainers = [
  'button',
  'label',
  'summary',
  'option',
  'legend',
  'h2',
  'h3',
  'h4',
  '.calendar-timeline-event > div > strong',
  'header',
  'nav',
  '.settings-page',
  '.settings-card',
  '.chat-settings-group',
  '.assistive-menu',
  '.wave-settings-title',
  '.page-title',
  '.app-name',
  '.app-label',
  '.status-section-label',
  '.status-section-name',
  '.status-section-heading',
  '.empty-state',
  '.empty-note',
  '.function-section-heading',
  '.browser-preferences',
  '.wave-select-menu',
  '.wave-select-trigger',
].join(',');

export function bindInterfaceLanguage(root: HTMLElement, getLanguage: () => InterfaceLanguage): () => void {
  const records = new WeakMap<Node, { original: string; rendered: string }>();
  const attrs = new WeakMap<Element, Map<string, { original: string; rendered: string }>>();
  let stopped = false;
  const observer = new MutationObserver(apply);
  function apply() {
    if (stopped) return;
    observer.disconnect();
    const language = getLanguage();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest(protectedContent) || !parent.closest(uiContainers)) continue;
      const old = records.get(node);
      const current = node.textContent || '';
      const original = old && current === old.rendered ? old.original : current;
      const rendered = interfaceText(original, language);
      if (rendered !== current) node.textContent = rendered;
      records.set(node, { original, rendered });
    }
    for (const element of [root, ...root.querySelectorAll<HTMLElement>('[placeholder],[aria-label],[title]')]) {
      if (element.closest('[data-no-ui-translate]')) continue;
      const saved = attrs.get(element) || new Map();
      for (const name of ['placeholder', 'aria-label', 'title']) {
        const current = element.getAttribute(name);
        if (current === null) continue;
        const old = saved.get(name);
        const original = old && old.rendered === current ? old.original : current;
        const rendered = interfaceText(original, language);
        if (current !== rendered) element.setAttribute(name, rendered);
        saved.set(name, { original, rendered });
      }
      attrs.set(element, saved);
    }
    root.lang = { 简体中文: 'zh-CN', 繁体中文: 'zh-TW', 英语: 'en', 日语: 'ja', 韩语: 'ko' }[language];
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'aria-label', 'title'],
    });
  }
  apply();
  return () => {
    stopped = true;
    observer.disconnect();
  };
}
export function useInterfaceLanguage(root: Ref<HTMLElement | null>, getLanguage: () => InterfaceLanguage) {
  let dispose: (() => void) | undefined;
  // Keep the same binding while switching language, so original UI labels remain recoverable.
  let bound: HTMLElement | null = null;
  let language = getLanguage();
  const stop = watch(
    [root, getLanguage],
    ([element, nextLanguage]) => {
      if (element !== bound) {
        dispose?.();
        dispose = undefined;
        bound = element;
      }
      language = nextLanguage;
      if (element) {
        // Trigger a harmless observed attribute; the binding retains originals.
        if (element === bound && dispose) element.setAttribute('title', element.getAttribute('title') || '');
        else dispose = bindInterfaceLanguage(element, () => language);
      }
    },
    { immediate: true, flush: 'post' },
  );
  onScopeDispose(() => {
    stop();
    dispose?.();
  });
}
