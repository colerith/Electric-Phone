declare const __WAVE_PHONE_MODULE_URL__: string;
/** Immutable bundled files are loaded by URL, never embedded in state or JS as Base64. */
export function staticResource(name: string): string {
  if (typeof __WAVE_PHONE_MODULE_URL__ === 'undefined')
    return `https://cdn.jsdelivr.net/gh/colerith/Electric-Phone@v1.3.17/assets/resources/${name}`;
  const url = new URL(`../assets/resources/${name}`, __WAVE_PHONE_MODULE_URL__);
  return url.origin === location.origin ? url.pathname : url.href;
}
