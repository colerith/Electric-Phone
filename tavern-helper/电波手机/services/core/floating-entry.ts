export type FloatingPosition = { x: number; y: number; edge: 'left' | 'right' | 'none' };
export function floatingBounds(view: Window) {
  const vv = view.visualViewport;
  const width = Math.max(1, Math.min(view.innerWidth, view.document.documentElement.clientWidth || view.innerWidth));
  const height = Math.max(
    1,
    Math.min(view.innerHeight, view.document.documentElement.clientHeight || view.innerHeight),
  );
  const left = Math.max(0, Math.min(vv?.offsetLeft || 0, width - 1));
  const top = Math.max(0, Math.min(vv?.offsetTop || 0, height - 1));
  const right = Math.min(width, left + (vv?.width || width));
  const bottom = Math.min(height, top + (vv?.height || height));
  const size = Math.min(56, right - left, bottom - top);
  return { left, top, size, maxX: Math.max(left, right - size), maxY: Math.max(top, bottom - size) };
}
/** All listeners and coordinates belong to the host document, not the script iframe. */
export function bindFloatingEntry(
  button: HTMLButtonElement,
  initial: FloatingPosition,
  save: (position: FloatingPosition) => void,
) {
  const doc = button.ownerDocument,
    view = doc.defaultView!;
  let position = {
      x: Number.isFinite(initial?.x) ? initial.x : 1,
      y: Number.isFinite(initial?.y) ? initial.y : 0.56,
      edge: initial?.edge || 'right',
    },
    x = 0,
    y = 0,
    dragged = false,
    suppressUntil = 0;
  let stopDrag: (() => void) | undefined;
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const render = () => {
    const b = floatingBounds(view);
    x =
      position.edge === 'left'
        ? b.left
        : position.edge === 'right'
          ? b.maxX
          : b.left + clamp(position.x, 0, 1) * (b.maxX - b.left);
    y = b.top + clamp(position.y, 0, 1) * (b.maxY - b.top);
    Object.assign(button.style, { left: `${x}px`, top: `${y}px`, width: `${b.size}px`, height: `${b.size}px` });
    // Keep layout coordinates inside the viewport; only paint one third past the clipped edge.
    button.style.setProperty(
      '--wave-float-offset',
      `${position.edge === 'left' ? -b.size / 3 : position.edge === 'right' ? b.size / 3 : 0}px`,
    );
    button.classList.toggle('is-docked', position.edge !== 'none');
  };
  const start = (
    sx: number,
    sy: number,
    listen: (move: (x: number, y: number, event: Event) => void, end: () => void) => () => void,
  ) => {
    stopDrag?.();
    const bx = x,
      by = y;
    const startingEdge = position.edge;
    dragged = false;
    const end = () => {
      stopDrag?.();
      stopDrag = undefined;
      button.classList.remove('is-dragging');
      if (dragged) {
        const b = floatingBounds(view);
        position.edge =
          Math.min(x - b.left, b.maxX - x) < (startingEdge === 'none' ? 24 : 8)
            ? x - b.left < b.maxX - x
              ? 'left'
              : 'right'
            : 'none';
        suppressUntil = Date.now() + 450;
        save({ ...position });
      }
      render();
    };
    stopDrag = listen((cx, cy, event) => {
      if (!dragged && Math.hypot(cx - sx, cy - sy) < 6) return;
      dragged = true;
      if (event.cancelable) event.preventDefault();
      const b = floatingBounds(view);
      x = clamp(bx + cx - sx, b.left, b.maxX);
      y = clamp(by + cy - sy, b.top, b.maxY);
      position = { x: (x - b.left) / (b.maxX - b.left || 1), y: (y - b.top) / (b.maxY - b.top || 1), edge: 'none' };
      button.classList.add('is-dragging');
      render();
    }, end);
  };
  const pointer = (event: PointerEvent) => {
    if (event.button > 0 || event.isPrimary === false) return;
    start(event.clientX, event.clientY, (move, end) => {
      const moving = (e: PointerEvent) => {
        if (e.pointerId === event.pointerId) move(e.clientX, e.clientY, e);
      };
      const ending = (e: PointerEvent) => {
        if (e.pointerId === event.pointerId) end();
      };
      doc.addEventListener('pointermove', moving, { passive: false });
      doc.addEventListener('pointerup', ending);
      doc.addEventListener('pointercancel', ending);
      button.addEventListener('lostpointercapture', ending);
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        /* Document listeners cover older WebViews. */
      }
      return () => {
        doc.removeEventListener('pointermove', moving);
        doc.removeEventListener('pointerup', ending);
        doc.removeEventListener('pointercancel', ending);
        button.removeEventListener('lostpointercapture', ending);
        try {
          if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
        } catch {
          /* Already released. */
        }
      };
    });
  };
  const mouse = (event: MouseEvent) => {
    if (event.button !== 0) return;
    start(event.clientX, event.clientY, (move, end) => {
      const moving = (e: MouseEvent) => move(e.clientX, e.clientY, e);
      doc.addEventListener('mousemove', moving);
      doc.addEventListener('mouseup', end);
      return () => {
        doc.removeEventListener('mousemove', moving);
        doc.removeEventListener('mouseup', end);
      };
    });
  };
  const touch = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    const first = event.touches[0];
    start(first.clientX, first.clientY, (move, end) => {
      const moving = (e: TouchEvent) => {
        const t = Array.from(e.touches).find(t => t.identifier === first.identifier);
        if (t) move(t.clientX, t.clientY, e);
      };
      doc.addEventListener('touchmove', moving, { passive: false });
      doc.addEventListener('touchend', end);
      doc.addEventListener('touchcancel', end);
      return () => {
        doc.removeEventListener('touchmove', moving);
        doc.removeEventListener('touchend', end);
        doc.removeEventListener('touchcancel', end);
      };
    });
  };
  const click = (event: MouseEvent) => {
    if (event.detail !== 0 && Date.now() < suppressUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const resize = () => {
    if (dragged) suppressUntil = Date.now() + 450;
    dragged = false;
    stopDrag?.();
    stopDrag = undefined;
    button.classList.remove('is-dragging');
    render();
  };
  button.addEventListener('click', click, true);
  if ('PointerEvent' in view) button.addEventListener('pointerdown', pointer);
  else {
    button.addEventListener('mousedown', mouse);
    button.addEventListener('touchstart', touch, { passive: true });
  }
  view.addEventListener('resize', resize);
  view.addEventListener('blur', resize);
  view.visualViewport?.addEventListener('resize', resize);
  view.visualViewport?.addEventListener('scroll', resize);
  render();
  return () => {
    stopDrag?.();
    button.removeEventListener('click', click, true);
    button.removeEventListener('pointerdown', pointer);
    button.removeEventListener('mousedown', mouse);
    button.removeEventListener('touchstart', touch);
    view.removeEventListener('resize', resize);
    view.removeEventListener('blur', resize);
    view.visualViewport?.removeEventListener('resize', resize);
    view.visualViewport?.removeEventListener('scroll', resize);
  };
}
