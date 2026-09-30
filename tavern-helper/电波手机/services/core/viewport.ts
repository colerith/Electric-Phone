/** Use the document hosting the panel, never the background script iframe. */
export function bindPhoneViewport(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView;
  if (!view) return () => {};
  const viewport = view.visualViewport;
  let focusTimer = 0;
  let frame = 0;
  const revealInput = () => {
    frame = 0;
    const active = root.ownerDocument.activeElement as HTMLElement | null;
    if (!active || !root.contains(active) || !active.matches('input,textarea,[contenteditable="true"]')) return;
    const rect = active.getBoundingClientRect();
    const top = viewport?.offsetTop || 0;
    const height = viewport?.height || view.innerHeight;
    if (rect.top < top + 12 || rect.bottom > top + height - 12)
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  };
  const scheduleReveal = () => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(revealInput);
  };
  const onFocus = () => {
    scheduleReveal();
    view.clearTimeout(focusTimer);
    focusTimer = view.setTimeout(scheduleReveal, 300);
  };
  const update = () => {
    const width = viewport?.width || view.innerWidth;
    const height = viewport?.height || view.innerHeight;
    const mobile = view.innerWidth <= 600 && view.matchMedia('(pointer: coarse)').matches;
    // A software keyboard may shorten the visual viewport; it must not change portrait width.
    const screenPortrait = view.screen.orientation?.type
      ? view.screen.orientation.type.startsWith('portrait')
      : view.screen.width <= view.screen.height;
    const portrait = view.innerWidth <= view.innerHeight || screenPortrait;
    const gap = mobile ? 0 : 12;
    const panelWidth = mobile && portrait ? width : 390;
    const panelHeight = mobile && portrait ? height : 790;
    const scale = mobile && portrait ? 1 : Math.max(0, Math.min(1, (width - gap * 2) / 390, (height - gap * 2) / 790));
    root.style.setProperty('--wave-viewport-width', `${width}px`);
    root.style.setProperty('--wave-viewport-height', `${height}px`);
    root.style.setProperty('--wave-viewport-left', `${viewport?.offsetLeft || 0}px`);
    root.style.setProperty('--wave-viewport-top', `${viewport?.offsetTop || 0}px`);
    root.style.setProperty('--wave-panel-width', `${Math.max(0, panelWidth)}px`);
    root.style.setProperty('--wave-panel-height', `${panelHeight}px`);
    root.style.setProperty('--wave-panel-scale', String(scale));
    root.classList.toggle('wave-mobile-viewport', mobile);
    scheduleReveal();
  };
  root.addEventListener('focusin', onFocus);
  update();
  view.addEventListener('resize', update);
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  return () => {
    root.removeEventListener('focusin', onFocus);
    view.clearTimeout(focusTimer);
    if (frame) view.cancelAnimationFrame(frame);
    view.removeEventListener('resize', update);
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
  };
}
