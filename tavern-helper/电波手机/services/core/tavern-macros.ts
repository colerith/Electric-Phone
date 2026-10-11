export function expandTavernMacros(text: string): string {
  if (!/\{\{|<(?:char|user)>/i.test(text)) return text;
  const host = (window as any).SillyTavern?.getContext?.() ?? (window.parent as any)?.SillyTavern?.getContext?.();
  if (!host?.substituteParams) throw Error('酒馆宏解析接口未就绪，请刷新酒馆后重试');
  return host.substituteParams(text.replace(/<char>/gi, '{{char}}').replace(/<user>/gi, '{{user}}'));
}
