import { PostTagsSchema } from './post-tags';
import { profileDecorationFields, ProfileBadgesSchema, ProfileTitleColorSchema } from './profile-badges';
import { TranslationSchema } from '../generation/module-settings';
import { z } from 'zod';

export const ZoneCommentSchema = z.object({
  translation: TranslationSchema.optional(),
  id: z.string(),
  author: z.string().prefault(''),
  authorKey: z.string().optional(),
  content: z.string(),
  createdAt: z.string().prefault(''),
  parentId: z.string().prefault(''),
  replyToAuthor: z.string().prefault(''),
  replyToAuthorKey: z.string().optional(),
});
export const ZonePostSchema = z.object({
  tags: PostTagsSchema,
  translation: TranslationSchema.optional(),
  id: z.string(),
  title: z.string().prefault(''),
  content: z.string(),
  date: z.string().prefault(''),
  category: z.string().prefault('碎碎念'),
  likes: z.coerce
    .number()
    .transform(value => Math.max(0, value))
    .prefault(0),
  comments: z.array(ZoneCommentSchema).prefault([]),
});
export const ZoneProfileSchema = z.object({
  username: z.string().prefault(''),
  handle: z.string().prefault(''),
  ...profileDecorationFields,
  tags: z.array(z.string()).prefault([]),
  signature: z.string().prefault(''),
  location: z.string().prefault(''),
  coverUrl: z.string().prefault(''),
});
export const ZonePageSchema = z.object({
  profile: ZoneProfileSchema.prefault({}),
  posts: z.array(ZonePostSchema).prefault([]),
});
export const ZoneUpdateSchema = z.object({
  profile: z
    .object({
      username: z.string().optional(),
      handle: z.string().optional(),
      title: z.string().optional(),
      titleColor: ProfileTitleColorSchema.optional(),
      badges: ProfileBadgesSchema.optional(),
      tags: z.array(z.string()).optional(),
      signature: z.string().optional(),
      location: z.string().optional(),
      coverUrl: z.string().optional(),
    })
    .optional(),
  posts: z.array(ZonePostSchema.extend({ tags: PostTagsSchema.unwrap().optional() })).optional(),
});
export type ZoneUpdate = z.infer<typeof ZoneUpdateSchema>;
export type ZonePost = z.infer<typeof ZonePostSchema>;
export type ZoneComment = z.infer<typeof ZoneCommentSchema>;
export type ZonePage = z.infer<typeof ZonePageSchema>;
export const ZoneInteractionSchema = z
  .object({
    liked: z.boolean().prefault(false),
    comments: z.array(ZoneCommentSchema).prefault([]),
    shares: z.number().prefault(0),
  })
  .prefault({});
export type ZoneInteraction = z.infer<typeof ZoneInteractionSchema>;
export const ZoneInteractionsSchema = z.record(z.string(), z.record(z.string(), ZoneInteractionSchema)).prefault({});

export type ZoneActor = { key: string; names: string[] };
/** Stable keys win; legacy names only resolve when they identify exactly one known person. */
export function resolveZoneAuthorKey(
  author: string,
  authorKey: string | undefined,
  ownerKey: string,
  actors: ZoneActor[],
): string {
  if (authorKey === 'owner') return ownerKey;
  if (authorKey) return actors.some(actor => actor.key === authorKey) ? authorKey : '';
  const normalize = (value: string) => value.trim().normalize('NFKC').replace(/^@+/, '').toLocaleLowerCase();
  const name = normalize(author);
  if (!name) return '';
  const matches = new Set(
    actors.filter(actor => actor.names.some(alias => normalize(alias) === name)).map(actor => actor.key),
  );
  return matches.size === 1 ? [...matches][0] : '';
}
function stableId(text: string): string {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ (char.codePointAt(0) || 0), 16777619);
  return `legacy-${(hash >>> 0).toString(36)}`;
}
export function parseZonePage(raw: string): ZonePage {
  const source = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  if (!source) return ZonePageSchema.parse({});
  if (source.startsWith('{')) {
    try {
      return ZonePageSchema.parse(JSON.parse(source));
    } catch {
      return ZonePageSchema.parse({});
    }
  }
  const profile: Record<string, unknown> = {};
  const fields: Record<string, string> = {
    用户名: 'username',
    账号: 'handle',
    头衔: 'title',
    称号: 'title',
    签名: 'signature',
    定位: 'location',
    标签: 'tags',
  };
  const posts: ZonePost[] = [];
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim().replace(/^[-*]\s*/, '');
    if (!line) continue;
    const pair = line.match(/^([^：:]+)[：:]\s*(.*)$/);
    if (pair && fields[pair[1]]) {
      profile[fields[pair[1]]] = pair[1] === '标签' ? pair[2].split(/[、,，/]+/).filter(Boolean) : pair[2];
      continue;
    }
    if (/^(动态|日记)[：:]?$/.test(line)) continue;
    const bracket = line.match(/^[【[]([^】\]]+)[】\]]\s*[：:]?\s*(.*)$/);
    posts.push(
      ZonePostSchema.parse({
        id: stableId(line),
        content: bracket ? bracket[2] : line,
        date: bracket ? bracket[1] : '',
      }),
    );
  }
  return ZonePageSchema.parse({ profile, posts });
}
/** AI sends additions/edits with stable IDs; never discard existing posts or profile fields. */
export function mergeZoneSnapshot(current: string, update: unknown): string {
  const previous = parseZonePage(current);
  let incoming: unknown = update;
  if (typeof update === 'string') {
    try {
      incoming = JSON.parse(update);
    } catch {
      incoming = parseZonePage(update);
    }
  }
  const patch = ZoneUpdateSchema.parse(incoming);
  const posts = [...previous.posts];
  for (const post of patch.posts || []) {
    const index = posts.findIndex(item => item.id === post.id);
    if (index < 0) posts.unshift(ZonePostSchema.parse(post));
    else
      posts[index] = {
        ...post,
        tags: post.tags ?? posts[index].tags,
        comments: [
          ...new Map([
            ...posts[index].comments.map(comment => [comment.id, comment] as const),
            ...post.comments.map(
              comment =>
                [comment.id, { ...posts[index].comments.find(old => old.id === comment.id), ...comment }] as const,
            ),
          ]).values(),
        ],
      };
  }
  return JSON.stringify({ profile: { ...previous.profile, ...patch.profile }, posts });
}
