import { z } from 'zod';
import { ChatPreferencesSchema, type ChatPreferences } from '../chat/chat-preferences';

export const LIMITED_APPS = ['memo', 'zone', 'calendar', 'browse'] as const;
export type LimitedApp = (typeof LIMITED_APPS)[number];
const limit = z.number().int().min(0).max(5).prefault(3);
export const bilingual = {
  syncChat: z.boolean().prefault(true),
  autoTranslate: z.boolean().prefault(false),
  expandTranslation: z.boolean().prefault(true),
  sourceLanguage: z.string().prefault('韩语'),
  targetLanguage: z.string().prefault('简体中文'),
};
export const ModuleSettingsSchema = z
  .object({
    memo: z.object({ maxNew: limit, maxDoodles: limit, ...bilingual }).prefault({}),
    zone: z.object({ maxNew: limit, ...bilingual }).prefault({}),
    calendar: z.object({ maxNew: limit }).prefault({}),
    browse: z.object({ maxNew: limit, ...bilingual }).prefault({}),
  })
  .prefault({});
export type ModuleSettings = z.infer<typeof ModuleSettingsSchema>;
export const TranslationSchema = z.object({
  language: z.string().min(1),
  title: z.string().default(''),
  content: z.string(),
});
export const GeneratedItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(''),
  content: z.string(),
  translation: TranslationSchema.optional(),
});
export const MemoDataSchema = z.object({
  notes: z.array(GeneratedItemSchema).default([]),
  doodles: z.array(GeneratedItemSchema.extend({ interpretation: z.string().default('') })).default([]),
});
export const CalendarItemSchema = z.object({
  id: z.string().min(1),
  date: z.string().default(''),
  time: z.string().default(''),
  content: z.string(),
  important: z.boolean().default(false),
  done: z.boolean().default(false),
});
export const BrowseItemSchema = GeneratedItemSchema.extend({ url: z.string().default('') });
export function legacyId(text: string): string {
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `legacy-${(hash >>> 0).toString(36)}`;
}
export function jsonObject(raw: string): unknown | undefined {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  if (!text.startsWith('{')) return undefined;
  return JSON.parse(text);
}

export function resolveBilingual<
  T extends {
    syncChat?: boolean;
    autoTranslate: boolean;
    expandTranslation: boolean;
    sourceLanguage: string;
    targetLanguage: string;
  },
>(local: T, chat?: Partial<ChatPreferences>): T {
  if (local.syncChat === false || !chat) return local;
  const p = ChatPreferencesSchema.parse(chat);
  return {
    ...local,
    autoTranslate: p.autoTranslate,
    expandTranslation: p.expandTranslation,
    sourceLanguage: p.sourceLanguage,
    targetLanguage: p.targetLanguage,
  };
}

export function resolveModuleSettings(settings: ModuleSettings, chat?: Partial<ChatPreferences>): ModuleSettings {
  return {
    ...settings,
    memo: resolveBilingual(settings.memo, chat),
    zone: resolveBilingual(settings.zone, chat),
    browse: resolveBilingual(settings.browse, chat),
  };
}
