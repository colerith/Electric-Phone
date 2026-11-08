export const HTML_PATTERN = /<!--wave-phone-card:start-->[\s\S]*?<!--wave-phone-card:end-->/g;

export function stripInlineCards(text: string): string {
  return text.replace(HTML_PATTERN, '');
}
