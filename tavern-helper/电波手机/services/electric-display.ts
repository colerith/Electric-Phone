import { readChatFloor } from './chat-reader';
import { splitElectric } from './electric';
export function registerElectricDisplay(isHidden: () => boolean) {
  const doc = window.parent.document;
  let timer: ReturnType<typeof setTimeout> | undefined,
    stopped = false;
  const refresh = () => {
    if (stopped) return;
    doc.querySelectorAll<HTMLElement>('.mes[mesid] .mes_text').forEach(container => {
      const id = container.closest('.mes')?.getAttribute('mesid');
      if (!id || !/^\d+$/.test(id)) return;
      const raw = readChatFloor(id)?.message || '',
        electric = splitElectric(raw),
        content = electric.electric;
      const existing = container.querySelector<HTMLDetailsElement>(':scope > .wave-electric-host');
      container.querySelectorAll('electric').forEach(element => element.remove());
      if (isHidden() || !content) {
        existing?.remove();
        return;
      }
      if (existing?.querySelector('pre')?.textContent === content) return;
      existing?.remove();
      const details = doc.createElement('details'),
        summary = doc.createElement('summary'),
        body = doc.createElement('pre');
      details.className = 'wave-electric-host';
      details.style.cssText = 'margin:8px 0 14px;color:inherit;opacity:.8;font-size:.9em;';
      summary.textContent = `◷  ${electric.electricTitle || '查看 Ecot'}`;
      summary.style.cssText = 'cursor:pointer;list-style:revert;padding:8px 0;';
      body.textContent = content;
      body.style.cssText =
        'white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;border-left:2px solid currentColor;padding:10px 14px;max-height:320px;overflow:auto;';
      details.append(summary, body);
      container.prepend(details);
    });
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 100);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.querySelector('#chat') || doc.body, { childList: true, subtree: true, characterData: true });
  refresh();
  return {
    refresh,
    dispose: () => {
      stopped = true;
      clearTimeout(timer);
      observer.disconnect();
      doc.querySelectorAll('.wave-electric-host').forEach(node => node.remove());
    },
  };
}
