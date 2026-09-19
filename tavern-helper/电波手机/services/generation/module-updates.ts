import { z } from 'zod';
import { parseMemoData } from '../apps/memo';
import { parseCalendar } from '../apps/calendar';
import { parseBrowseNotes } from '../apps/browser';
import { parseZonePage, ZoneUpdateSchema, mergeZoneSnapshot } from '../space/zone';
import {
  MemoDataSchema,
  CalendarItemSchema,
  BrowseItemSchema,
  ModuleSettingsSchema,
  jsonObject,
  type LimitedApp,
  type ModuleSettings,
} from './module-settings';

export type RoundBudget = Record<string, number>;
export function isLimitedApp(app: string): app is LimitedApp {
  return ['memo', 'zone', 'calendar', 'browse'].includes(app);
}
/** Only new stable IDs consume the shared budget; updates remain possible at zero. */
export function limitModulePatch(
  app: LimitedApp,
  current: string,
  update: unknown,
  settings: ModuleSettings = ModuleSettingsSchema.parse({}),
  budget: RoundBudget = {},
): Record<string, unknown> {
  const value = typeof update === 'string' ? jsonObject(update) : update;
  const prefs = settings[app];
  function select<T extends { id: string; translation?: { language: string } }>(
    old: T[],
    incoming: T[],
    key: string,
    cap: number,
  ): T[] {
    const ids = new Set(old.map(item => item.id));
    const accepted = new Map<string, T>();
    for (const item of incoming) {
      if (!ids.has(item.id)) {
        if ((budget[key] || 0) >= cap) continue;
        budget[key] = (budget[key] || 0) + 1;
        ids.add(item.id);
      }
      const copy = { ...item };
      if (copy.translation && 'targetLanguage' in prefs && copy.translation.language !== prefs.targetLanguage)
        delete copy.translation;
      accepted.set(copy.id, copy);
    }
    return [...accepted.values()];
  }
  if (app === 'memo') {
    const old = parseMemoData(current);
    const patch = value === undefined ? parseMemoData(String(update || '')) : MemoDataSchema.parse(value);
    return {
      notes: select(old.notes, patch.notes, 'memo.notes', prefs.maxNew),
      doodles: select(old.doodles, patch.doodles, 'memo.doodles', settings.memo.maxDoodles),
    };
  }
  if (app === 'zone') {
    const patch = value === undefined ? parseZonePage(String(update || '')) : ZoneUpdateSchema.parse(value);
    const previous = parseZonePage(current).posts;
    const incoming = (patch.posts || []).map(post => ({
      ...post,
      tags: post.tags ?? previous.find(item => item.id === post.id)?.tags ?? [],
    }));
    return { ...patch, posts: select(previous, incoming, 'zone.posts', prefs.maxNew) };
  }
  if (app === 'calendar') {
    const patch =
      value === undefined
        ? parseCalendar(String(update || ''))
        : z.object({ events: z.array(CalendarItemSchema).default([]) }).parse(value).events;
    return { events: select(parseCalendar(current), patch, 'calendar.events', prefs.maxNew) };
  }
  const patch =
    value === undefined
      ? parseBrowseNotes(String(update || ''))
      : z.object({ notes: z.array(BrowseItemSchema).default([]) }).parse(value).notes;
  return { notes: select(parseBrowseNotes(current), patch, 'browse.notes', prefs.maxNew) };
}
export function mergeLimitedModule(
  app: LimitedApp,
  current: string,
  update: unknown,
  settings?: ModuleSettings,
  budget?: RoundBudget,
): string {
  const patch = limitModulePatch(app, current, update, settings, budget);
  function merge<T extends { id: string }>(old: T[], incoming: T[]): T[] {
    return [...new Map([...old, ...incoming].map(item => [item.id, item])).values()];
  }
  if (app === 'zone') return mergeZoneSnapshot(current, patch);
  if (app === 'memo') {
    const old = parseMemoData(current),
      next = MemoDataSchema.parse(patch);
    return JSON.stringify({ notes: merge(old.notes, next.notes), doodles: merge(old.doodles, next.doodles) });
  }
  if (app === 'calendar')
    return JSON.stringify({
      events: merge(parseCalendar(current), z.object({ events: z.array(CalendarItemSchema) }).parse(patch).events),
    });
  return JSON.stringify({
    notes: merge(parseBrowseNotes(current), z.object({ notes: z.array(BrowseItemSchema) }).parse(patch).notes),
  });
}

/** Expose deterministic IDs for legacy records, without applying new-generation caps to history. */
export function moduleSnapshot<T extends { memo: string; zone: string; calendar: string; browse: string }>(
  snapshot: T,
): T {
  return {
    ...snapshot,
    memo: JSON.stringify(parseMemoData(snapshot.memo)),
    zone: JSON.stringify(parseZonePage(snapshot.zone)),
    calendar: JSON.stringify({ events: parseCalendar(snapshot.calendar) }),
    browse: JSON.stringify({ notes: parseBrowseNotes(snapshot.browse) }),
  };
}
