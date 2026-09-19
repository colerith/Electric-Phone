import { isLimitedApp, limitModulePatch } from './module-updates';
import { splitElectric } from './electric';
import { mergeWallet } from '../wallet/wallet';
import { z } from 'zod';
import { APP_IDS, ModelMessageSchema, ModelReactionsSchema } from '../../schemas';
export const MODULE_LABELS = {
  status: '状态',
  messages: '消息',
  memo: '备忘',
  zone: '空间',
  wallet: '钱包',
  calendar: '日历',
  browse: '浏览',
  music: '音乐',
};
export const ModuleDeltaSchema = z
  .object({
    version: z.literal(1),
    char_id: z.string().min(1),
    char_name: z.string().min(1),
    reactions: ModelReactionsSchema,
    messages: z.array(ModelMessageSchema).max(15).default([]),
    app_updates: z.partialRecord(z.enum(APP_IDS), z.union([z.string(), z.record(z.string(), z.unknown())])).default({}),
  })
  .superRefine((delta, ctx) => {
    for (const [key, value] of Object.entries(delta.app_updates)) {
      try {
        if (isLimitedApp(key)) limitModulePatch(key, '', value);
        if (key === 'wallet') mergeWallet('', value);
      } catch {
        ctx.addIssue({ code: 'custom', path: ['app_updates', key], message: '模块增量结构无效' });
      }
    }
  });
export type ModuleDelta = z.infer<typeof ModuleDeltaSchema>;
export const DATA_PATTERN = /<wave_phone_delta>\s*([\s\S]*?)\s*<\/wave_phone_delta>/g;
export const HTML_PATTERN = /<!--wave-phone-card:start-->[\s\S]*?<!--wave-phone-card:end-->/g;
export function readModuleDeltas(text: string): ModuleDelta[] {
  return [
    ...splitElectric(text)
      .body.replace(/<角色手机>[\s\S]*?<\/角色手机>/g, '')
      .matchAll(new RegExp(DATA_PATTERN.source, 'g')),
  ].flatMap(match => {
    try {
      const result = ModuleDeltaSchema.safeParse(JSON.parse(match[1]!));
      return result.success ? [result.data] : [];
    } catch {
      return [];
    }
  });
}
export function serializeDelta(delta: ModuleDelta): string {
  // Escape delimiter characters inside strings without changing the JSON meaning.
  return `<wave_phone_delta>${JSON.stringify(delta).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')}</wave_phone_delta>`;
}
export function stripInlineCards(text: string): string {
  return text.replace(HTML_PATTERN, '');
}
