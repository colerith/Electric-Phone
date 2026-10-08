import { isExtensionRuntime } from './runtime';
const ROOT = 'wave-phone-script-root';
export function createScriptIdDiv(): JQuery<HTMLDivElement> {
  return (
    isExtensionRuntime ? $('<div>').attr('data-wave-runtime', 'extension') : $('<div>').attr('script_id', getScriptId())
  ) as JQuery<HTMLDivElement>;
}
export function destroyScriptIdDiv(): void {
  if (isExtensionRuntime) document.querySelector(`#${ROOT}[data-wave-runtime="extension"]`)?.remove();
  else $(`div[script_id="${getScriptId()}"]`).remove();
}
export function teleportStyle(): void {
  if (isExtensionRuntime || $(`head > div[script_id="${getScriptId()}"]`).length) return;
  $('<div>').attr('script_id', getScriptId()).append($('head > style', document).clone()).appendTo('head');
}
export function deteleportStyle(): void {
  if (!isExtensionRuntime) $(`head > div[script_id="${getScriptId()}"]`).remove();
}
