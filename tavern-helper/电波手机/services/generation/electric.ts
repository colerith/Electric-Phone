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

/** Group Ecot belongs to a reply round, not to the member whose bubble carries it. */
export function groupRoundElectric(
  messages: { id: string; sender: string; content: string; withdrawn?: boolean; payload: Record<string, unknown> }[],
) {
  const rounds = new Map<string, { first: string; title: string; sections: Set<string> }>();
  let segment = 0;
  for (const message of messages) {
    if (message.sender === 'user') {
      segment++;
      continue;
    }
    if (message.withdrawn) continue;
    if (
      message.sender !== 'char' &&
      !message.payload.replyGenerationId &&
      message.payload.sourceMessageId === undefined
    )
      continue;
    const key = `${segment}:${message.payload.replyGenerationId || (message.payload.sourceMessageId !== undefined ? `floor:${message.payload.sourceMessageId}` : 'legacy')}`;
    const round = rounds.get(key) || { first: message.id, title: '', sections: new Set<string>() };
    const inline = splitElectric(message.content);
    for (const text of [message.payload.electric, inline.electric]) {
      if (typeof text === 'string' && text.trim()) round.sections.add(text.trim());
    }
    const title = message.payload.electricTitle || inline.electricTitle;
    if (!round.title && typeof title === 'string') round.title = title.trim();
    rounds.set(key, round);
  }
  return Object.fromEntries(
    [...rounds.values()]
      .filter(round => round.sections.size)
      .map(round => [round.first, { title: round.title || '查看 Ecot', text: [...round.sections].join('\n\n') }]),
  );
}
