export const ELECTRIC_PATTERN = /<electric\b[^>]*>([\s\S]*?)(?:<\/electric\s*>|$)/gi;
export function splitElectric(text: string) {
  const sections: string[] = [];
  const titles: string[] = [];
  const body = text.replace(new RegExp(ELECTRIC_PATTERN.source, 'gi'), (whole, section: string) => {
    const opening = whole.slice(0, whole.indexOf('>') + 1);
    const title = opening.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value = (title?.[1] || title?.[2] || title?.[3] || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (value) titles.push(value);
    if (section.trim()) sections.push(section.trim());
    return '';
  });
  return { body: body.trim(), electric: sections.join('\n\n'), electricTitle: titles[0] || '' };
}
