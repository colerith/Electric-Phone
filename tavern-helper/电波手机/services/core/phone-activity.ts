let enabled = true;
let controller = new AbortController();
export function setPhoneActive(value: boolean): void {
  enabled = value;
  if (!value) controller.abort();
  else if (controller.signal.aborted) controller = new AbortController();
}
export function phoneActivitySignal(): AbortSignal {
  if (!enabled) throw Error('电波手机已关闭');
  return controller.signal;
}
