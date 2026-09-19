import { z } from 'zod';
export const TreeHoleCommentSchema = z.object({
  id: z.string(),
  alias: z.string(),
  content: z.string().max(2000),
  createdAt: z.number(),
  replyTo: z.string().default(''),
});
export const TreeHolePostSchema = z.object({
  id: z.string(),
  alias: z.string(),
  content: z.string().max(5000),
  createdAt: z.number(),
  mine: z.boolean().default(false),
  liked: z.boolean().default(false),
  comments: z.array(TreeHoleCommentSchema).default([]),
});
export const TreeHoleStateSchema = z
  .record(z.string(), z.object({ topic: z.string(), posts: z.array(TreeHolePostSchema).default([]) }))
  .prefault({});
const topics = [
  '最近哪件小事偷偷治愈了你？',
  '如果给过去的自己留一句话，你会说什么？',
  '有没有一句一直没能说出口的话？',
  '今天最想逃去哪里，为什么？',
  '分享一个只有夜里才敢承认的愿望。',
  '你正在慢慢释怀什么？',
  '描述一个想永远记住的普通瞬间。',
  '如果明天不用担心任何事，你想怎样度过？',
  '你心里理想的陪伴是什么模样？',
  '有什么看似微不足道，却让你坚持到现在？',
  '给陌生人留一句温柔的话。',
  '最近一次心动发生在什么时候？',
];
export function treeHoleDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dailyTopic(day: string, scope: string): string {
  let hash = 2166136261;
  for (const char of `${scope}:${day}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return topics[(hash >>> 0) % topics.length];
}
