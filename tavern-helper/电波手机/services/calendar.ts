import { z } from 'zod';
import { CalendarItemSchema, jsonObject } from './module-settings';
export interface CalendarEvent {
  id: string;
  date: string;
  time: string;
  content: string;
  important: boolean;
  done: boolean;
}
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseCalendar(raw: string): CalendarEvent[] {
  try {
    const data = jsonObject(raw);
    if (data !== undefined) return z.object({ events: z.array(CalendarItemSchema) }).parse(data).events;
  } catch {
    return [];
  }
  const events: CalendarEvent[] = [];
  let date = '';
  let time = '';
  for (const line of raw
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)) {
    const match = line.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:\s*(\d{1,2}[:：]\d{2}))?/);
    if (match) {
      date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      time = (match[4] || '').replace('：', ':').padStart(match[4] ? 5 : 0, '0');
    }
    const content = (match ? line.slice(match.index! + match[0].length) : line).replace(/^[\s\]】\-:：]+/, '').trim();
    if (!content) continue;
    const hash = Array.from(`${date}|${time}|${content}`)
      .reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0)
      .toString(36);
    events.push({
      id: `event-${hash}-${events.length}`,
      date,
      time,
      content: content.replace(/<\/?s>|\[(?:重要|已完成)\]/g, '').trim(),
      important: line.includes('[重要]'),
      done: line.includes('<s>') || line.includes('[已完成]'),
    });
  }
  return events;
}
