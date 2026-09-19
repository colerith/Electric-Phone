import { z } from 'zod';

export const ChatPreferencesSchema = z
  .object({
    autoTranslate: z.boolean().prefault(false),
    expandTranslation: z.boolean().prefault(true),
    outgoingTranslation: z.boolean().prefault(false),
    inputLanguage: z.string().prefault('简体中文'),
    outgoingLanguage: z.string().prefault(''),
    sourceLanguage: z.string().prefault('韩语'),
    targetLanguage: z.string().prefault('简体中文'),
    timeMode: z.enum(['real', 'off', 'custom']).prefault('off'),
    customTime: z.string().prefault(''),
    distant: z.boolean().prefault(false),
    userLocation: z.string().prefault(''),
    charLocation: z.string().prefault(''),
    userTimezone: z.string().prefault('Asia/Shanghai'),
    charTimezone: z.string().prefault('Asia/Seoul'),
  })
  .prefault({});
export type ChatPreferences = z.infer<typeof ChatPreferencesSchema>;

export function worldContext(p: ChatPreferences, now = new Date()): string {
  if (p.timeMode === 'off') return '';
  // 自定义值明确带偏移量，双方时区始终映射同一个时刻。
  const date = p.timeMode === 'custom' ? new Date(p.customTime) : now;
  if (!Number.isFinite(date.getTime())) throw Error('请填写带时区的有效自定义时间。');
  const format = (zone: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: zone,
      dateStyle: 'full',
      timeStyle: 'short',
      hour12: false,
    }).format(date);
  return `[时间感知 · ${p.timeMode === 'real' ? '真实时间' : '自定义时间'}]\nUser：${p.userLocation || '未指定地点'}，${format(p.userTimezone)}（${p.userTimezone}）\nChar：${p.distant ? p.charLocation || '未指定地点' : p.userLocation || '与 User 同地'}，${format(p.distant ? p.charTimezone : p.userTimezone)}（${p.distant ? p.charTimezone : p.userTimezone}）\n按各自当地时间感知昼夜与日期；${p.distant ? '双方异地，不假定可以当面互动。' : '双方使用同一当地时间。'}`;
}

export function languageContext(p: ChatPreferences): string {
  return p.autoTranslate || p.outgoingTranslation
    ? `角色文字消息使用${p.sourceLanguage}。User 双语消息中，“实际收到”是已经发送给角色的内容，“原始输入”仅供语义参考；两者属于同一条消息，不是翻译任务，也不得分别回复。`
    : '';
}
