export type StatusMetric = { value: number | null; description: string };
export type StatusProfile = {
  name: string;
  favor: StatusMetric;
  desire: StatusMetric;
  moods: string[];
  thought: string;
  organs: Array<{ name: string; description: string }>;
};

export function parseStatusMetric(source: string): StatusMetric {
  const match = source.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[%％]?/);
  if (!match) return { value: null, description: source.trim() };
  const description = source
    .slice(match[0].length)
    .trim()
    .replace(/^[（(]\s*|\s*[）)]$/g, '')
    .replace(/[[\]]/g, '')
    .trim();
  return { value: Math.min(100, Math.max(0, Number(match[1]))), description };
}

/** Read the same status fields as ta's phone, preserving multiline sections. */
export function parseStatusProfile(raw: string): StatusProfile {
  const jsonSource = raw
    .trim()
    .replace(/^<status(?:\s[^>]*)?>|<\/status>$/gi, '')
    .trim();
  try {
    const parsed = JSON.parse(jsonSource) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const data =
        record.status && typeof record.status === 'object' && !Array.isArray(record.status)
          ? (record.status as Record<string, unknown>)
          : record;
      const text = (value: unknown): string => {
        if (Array.isArray(value)) return value.map(text).filter(Boolean).join('、');
        if (value && typeof value === 'object')
          return Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => `${key}：${text(item)}`)
            .join('\n');
        return value === null || value === undefined ? '' : String(value).trim();
      };
      const pick = (...keys: string[]) => text(keys.map(key => data[key]).find(value => value !== undefined));
      const metric = (value: string, delta = ''): StatusMetric => {
        const parsedMetric = parseStatusMetric(value);
        return delta ? { ...parsedMetric, description: delta } : parsedMetric;
      };
      const organValue = data['器官状态'] ?? data.organs;
      const organs =
        organValue && typeof organValue === 'object' && !Array.isArray(organValue)
          ? Object.entries(organValue as Record<string, unknown>).map(([name, description]) => ({
              name,
              description: text(description),
            }))
          : text(organValue)
              .split(/\r?\n/)
              .filter(Boolean)
              .map(line => {
                const match = line.match(/^([^：:]{1,24})[：:]\s*(.*)$/);
                return match
                  ? { name: match[1].trim(), description: match[2].trim() }
                  : { name: '身体感受', description: line };
              });
      return {
        name: pick('角色名称', '角色名', '姓名'),
        favor: metric(pick('好感指数', 'fav'), pick('好感变化', 'fav_delta')),
        desire: metric(pick('性欲指数', 'soc')),
        moods: [
          ...new Set(
            pick('情绪气泡', 'mood')
              .split(/[；;、，,/|\s]+/)
              .filter(Boolean),
          ),
        ],
        thought: pick('隐秘心声', 'hidden_thought').replace(/^["“「]|["”」]$/g, ''),
        organs,
      };
    }
  } catch {
    // Legacy status text continues through the line-oriented parser below.
  }
  const fields: Record<string, string[]> = {};
  let current = '';
  const source = raw.replace(/<\/?status(?:\s[^>]*)?>/gi, '');
  for (const sourceLine of source.split(/\r?\n/)) {
    const line = sourceLine.trim().replace(/^[-*]\s*/, '');
    const heading = line.match(
      /^(角色名称|角色名|姓名|角色ID|好感指数|性欲指数|情绪气泡|隐秘心声|器官状态)\s*[：:]\s*(.*)$/,
    );
    if (heading) {
      current = heading[1];
      fields[current] = [heading[2]];
    } else if (current) fields[current].push(line);
  }
  const field = (key: string) => (fields[key] || []).join('\n').trim();
  const organs: StatusProfile['organs'] = [];
  for (const line of fields['器官状态'] || []) {
    if (!line) continue;
    const bracket = line.match(/^[【[]([^】\]]+)[】\]]\s*[：:]?\s*(.*)$/);
    const colon = line.match(/^([^：:]{1,24})[：:]\s*(.*)$/);
    const item = bracket || colon;
    if (item) organs.push({ name: item[1].trim(), description: item[2].trim() });
    else if (organs.length) organs[organs.length - 1].description += `\n${line}`;
    else organs.push({ name: '身体感受', description: line });
  }
  return {
    name: field('角色名称') || field('角色名') || field('姓名'),
    favor: parseStatusMetric(field('好感指数')),
    desire: parseStatusMetric(field('性欲指数')),
    moods: [
      ...new Set(
        field('情绪气泡')
          .split(/[；;、，,/|\s]+/)
          .map(value => value.replace(/^[【[「]|[】\]」]$/g, ''))
          .filter(Boolean),
      ),
    ],
    thought: field('隐秘心声').replace(/^["“「]|["”」]$/g, ''),
    organs,
  };
}
