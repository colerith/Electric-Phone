import { MemoDataSchema, jsonObject, legacyId } from './module-settings';
export type MemoNote = { title: string; content: string };
export type MemoPage = { notes: MemoNote[]; doodle: string; interpretation: string };

/** Keep notebook groups and ASCII whitespace separate from prose. */
export function parseLegacyMemoPage(raw: string): MemoPage {
  const source = raw
    .replace(/<\/?memo(?:\s[^>]*)?>/gi, '')
    .replace(/\r\n/g, '\n')
    .trim();
  const doodleHeading = /(?:^|\n)[ \t]*随性涂鸦[ \t]*[：:][ \t]*/.exec(source);
  const interpretationHeading = /(?:^|\n)[ \t]*涂鸦解析[ \t]*[：:][ \t]*/.exec(source);
  const noteEnd = Math.min(doodleHeading?.index ?? source.length, interpretationHeading?.index ?? source.length);
  let doodle = doodleHeading
    ? source.slice(
        doodleHeading.index + doodleHeading[0].length,
        interpretationHeading && interpretationHeading.index > doodleHeading.index
          ? interpretationHeading.index
          : undefined,
      )
    : '';
  doodle = doodle
    .replace(/^\n+|\n+$/g, '')
    .replace(/^```[^\n]*\n/, '')
    .replace(/\n```\s*$/, '');
  const interpretation = interpretationHeading
    ? source.slice(interpretationHeading.index + interpretationHeading[0].length).trim()
    : '';
  const notes: MemoNote[] = [];
  let title = '';
  let body: string[] = [];
  function flush(): void {
    if (title || body.length) notes.push({ title: title || '随手记', content: body.join('\n').trim() });
    title = '';
    body = [];
  }
  for (const sourceLine of source.slice(0, noteEnd).split('\n')) {
    const line = sourceLine.trim();
    const heading = line.match(/^[【[](.+?)[】\]][：:]?\s*(.*)$/);
    if (heading) {
      flush();
      title = heading[1].trim();
      if (heading[2]) body.push(heading[2]);
      continue;
    }
    if (!line) {
      if (body.length && body[body.length - 1]) body.push('');
      continue;
    }
    const plainHeading = line.match(/^([^：:]{1,60})[：:]\s*(.*)$/);
    if (plainHeading && !title && !body.length) {
      title = plainHeading[1];
      if (plainHeading[2]) body.push(plainHeading[2]);
      continue;
    }
    body.push(line.replace(/^[-*]\s+/, '· '));
  }
  flush();
  return { notes, doodle, interpretation };
}

export function parseMemoData(raw: string) {
  try {
    const data = jsonObject(raw);
    if (data !== undefined) return MemoDataSchema.parse(data);
  } catch {
    return MemoDataSchema.parse({});
  }
  const page = parseLegacyMemoPage(raw);
  return MemoDataSchema.parse({
    notes: page.notes.map(note => ({ ...note, id: legacyId(JSON.stringify(note)) })),
    doodles:
      page.doodle || page.interpretation
        ? [
            {
              id: legacyId(page.doodle + page.interpretation),
              title: '随性涂鸦',
              content: page.doodle,
              interpretation: page.interpretation,
            },
          ]
        : [],
  });
}
export function parseMemoPage(raw: string): MemoPage {
  const page = parseMemoData(raw);
  return {
    notes: page.notes,
    doodle: page.doodles.map(d => d.content).join('\n\n'),
    interpretation: page.doodles.map(d => d.interpretation).join('\n\n'),
  };
}
