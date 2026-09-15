import { z } from 'zod';
export const PresetItemSchema = z.object({
  id: z.string(),
  order: z.number(),
  name: z.string().min(1).max(160),
  enabled: z.boolean(),
  kind: z.enum(['custom', 'builtin', 'runtime']),
  scope: z.enum(['all', 'chat', 'zone', 'moments']),
  content: z.string(),
  source: z
    .enum([
      'world_info_before',
      'char_description',
      'char_personality',
      'scenario',
      'persona_description',
      'chat_history',
      'world_info_after',
      'dialogue_examples',
      'user_input',
    ])
    .optional(),
  apps: z.array(z.enum(['status', 'messages', 'memo', 'zone', 'wallet', 'calendar', 'browse', 'music'])).optional(),
  category: z.enum(['chat', 'system', 'app', 'nsfw']).optional(),
  headingLevel: z.enum(['major', 'minor']).optional(),
  divider: z.boolean().default(false),
  systemKey: z.string().optional(),
});
export const PromptLibrarySchema = z
  .object({
    defaultToggles: z.record(z.string(), z.boolean()).default({}),
    activeId: z.string().default('default'),
    items: z
      .array(z.object({ id: z.string(), name: z.string().min(1).max(80), entries: z.array(PresetItemSchema) }))
      .default([]),
  })
  .prefault({});
export type PromptLibrary = z.infer<typeof PromptLibrarySchema>;
export type PresetItem = z.infer<typeof PresetItemSchema>;
export function isPresetDivider(name: string) {
  return /^(?:==.*==|✧.*✧|♡.*♡)$/.test(name.trim());
}

export function isPhonePresetEntry(entry: { name: string; systemKey?: string }) {
  return !!entry.systemKey?.startsWith('电波手机·') || entry.name.startsWith('电波手机·');
}
export function presetHeadingLevel(entry: Pick<PresetItem, 'name' | 'headingLevel'>) {
  return entry.headingLevel || (entry.name.trim().startsWith('==') ? 'major' : 'minor');
}
export function presetHeadingText(name: string) {
  return name.replace(/^[= .✟✧─♡‧₊]+|[= .✟✧─♡‧₊]+$/gu, '').trim();
}
export function presetCategory(
  entry: Pick<PresetItem, 'name' | 'category' | 'systemKey' | 'order'>,
): 'chat' | 'system' | 'app' | 'nsfw' {
  if (entry.category) return entry.category;
  const name = entry.systemKey || entry.name;
  if (isPhonePresetEntry(entry))
    return /应用规则|跨 App|空间|日程|朋友圈/.test(name) ? 'app' : /私聊/.test(name) ? 'chat' : 'system';
  if (
    (entry.order >= 44 && entry.order <= 76) ||
    /NSFW|性爱|前戏|词库|性癖|涩|喘息|器官|屁股|安全措施|生活之爱/.test(name)
  )
    return 'nsfw';
  return /预设头|预设尾|授权协议|生成边界/.test(name) ? 'system' : 'chat';
}

export function presetAppBindings(entry: { name: string; systemKey?: string; apps?: string[] }) {
  if (entry.apps) return entry.apps;
  const name = entry.systemKey || entry.name;
  const match = name.match(/^电波手机·应用规则·(status|messages|memo|zone|wallet|calendar|browse|music)$/);
  if (match) return [match[1]!];
  if (name === '电波手机·私聊回复') return ['messages'];
  return [];
}
