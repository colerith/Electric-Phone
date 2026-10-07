import {
  MomentsStateSchema,
  MomentPostSchema,
  MomentCommentSchema,
  momentTimeline,
  type MomentsState,
} from './moments';
import type { Identity } from '../../schemas';
import { TranslationSchema } from '../generation/module-settings';
import { spaceAvatarUrl } from './npc-avatar';
import { z } from 'zod';
export const TreeHoleCommentSchema = z.object({
  id: z.string(),
  alias: z.string(),
  translation: TranslationSchema.optional(),
  content: z.string().max(2000),
  createdAt: z.number(),
  replyTo: z.string().default(''),
  mine: z.boolean().optional(),
});
export const TreeHolePostSchema = z.object({
  id: z.string(),
  alias: z.string(),
  translation: TranslationSchema.optional(),
  content: z.string().max(5000),
  createdAt: z.number(),
  mine: z.boolean().default(false),
  liked: z.boolean().default(false),
  comments: z.array(TreeHoleCommentSchema).default([]),
});
export const TreeHoleStateSchema = z
  .record(
    z.string(),
    z.object({
      topic: z.string(),
      posts: z.array(TreeHolePostSchema).default([]),
      activity: MomentsStateSchema.optional(),
    }),
  )
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

/** Stable anonymous avatar drawn from the shared Notionists + Bottts Neutral pool. */
export function anonymousAvatarUrl(seed: string): string {
  return spaceAvatarUrl(`wave-hole-${seed}`);
}

const foodFlavors = [
  '焦糖',
  '草莓',
  '抹茶',
  '香草',
  '海盐',
  '蜂蜜',
  '椰香',
  '桂花',
  '柚子',
  '桃桃',
  '蓝莓',
  '芝士',
  '芒果',
  '可可',
  '榛果',
  '红豆',
  '黑糖',
  '薄荷',
  '橙香',
  '黄桃',
  '奶油',
  '香芋',
  '荔枝',
  '樱桃',
];
const foodTreats = [
  '布丁',
  '蛋挞',
  '曲奇',
  '奶冻',
  '吐司',
  '麻薯',
  '可颂',
  '泡芙',
  '丸子',
  '雪糕',
  '甜甜圈',
  '贝果',
  '汤圆',
  '软糖',
  '蛋糕',
  '酸奶',
  '小圆饼',
  '冰沙',
  '松饼',
  '奶茶',
  '大福',
  '冰淇淋',
  '铜锣烧',
  '米糕',
];
export function randomAnonymousId(previous = '', random = Math.random): string {
  const choices = foodFlavors
    .flatMap(flavor => foodTreats.map(treat => flavor + treat))
    .filter(name => name !== previous);
  return choices[Math.floor(random() * choices.length)];
}
export function randomAnonymousAvatarSeed(): string {
  return `anon-${crypto.randomUUID()}`;
}

export const TREE_HOLE_PATTERN = /<wave_tree_hole>\s*([\s\S]*?)\s*<\/wave_tree_hole>/g;
export function anonymousActorKey(key: string): string {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `anonymous:${(hash >>> 0).toString(36)}`;
}
export function anonymousActors(identities: Identity[]): Identity[] {
  return identities.map(identity => ({
    ...identity,
    charKey: anonymousActorKey(identity.charKey),
    stableId: anonymousActorKey(identity.charKey),
    name: `匿名旅人 ${anonymousActorKey(identity.charKey).split(':')[1]}`,
    nameAliases: [],
    idAliases: [],
    remark: '',
    about: '只根据树洞公开发言交流的匿名参与者',
    npcProfile: '匿名参与者，不暴露现实身份或私聊',
    relationshipToUser: '',
  }));
}
export function prepareTreeHoleActivity(
  daily: z.infer<typeof TreeHoleStateSchema>[string],
  settings: MomentsState['settings'],
): MomentsState {
  {
    const activity = daily.activity || MomentsStateSchema.parse({});
    const knownPosts = new Set(momentTimeline(activity).posts.map(post => post.id));
    const knownComments = new Set(momentTimeline(activity).comments.map(comment => comment.id));
    for (const post of daily.posts) {
      if (!knownPosts.has(post.id) && !activity.deletedPostIds.includes(post.id))
        activity.posts.push(
          MomentPostSchema.parse({
            id: post.id,
            authorKey: post.mine ? 'user' : anonymousActorKey(post.alias),
            authorName: post.alias,
            content: post.content,
            translation: post.translation,
            createdAt: post.createdAt,
            availableAt: 0,
          }),
        );
      if (!knownPosts.has(post.id) && post.liked && !activity.likes.includes(post.id)) activity.likes.push(post.id);
      for (const comment of post.comments)
        if (!knownComments.has(comment.id) && !activity.deletedCommentIds.includes(comment.id))
          activity.comments.push(
            MomentCommentSchema.parse({
              id: comment.id,
              postId: post.id,
              authorKey: comment.mine || comment.alias === '匿名的我' ? 'user' : anonymousActorKey(comment.alias),
              authorName: comment.alias,
              content: comment.content,
              translation: comment.translation,
              createdAt: comment.createdAt,
              availableAt: 0,
              replyToAuthorName: comment.replyTo,
            }),
          );
    }
    daily.activity = activity;
    // Keep legacy records as a migration source; tombstones prevent resurrection.
  }
  daily.activity.settings = {
    ...settings,
    postingCharKeys: settings.postingCharKeys.map(anonymousActorKey),
    imageMode: 'description',
    maxImages: 0,
    imageProbability: 0,
    npcRules: '匿名树洞访客，只知道公开发言，不知道人物真实身份、私聊或当前场景。',
  };
  return daily.activity;
}
export function treeHoleFeed(daily: z.infer<typeof TreeHoleStateSchema>[string], now = Date.now()) {
  if (!daily.activity) return daily.posts.map(post => ({ ...post, likeCount: Number(post.liked) }));
  const legacyPosts = daily.posts
    .filter(post => !daily.activity!.posts.some(current => current.id === post.id))
    .map(post =>
      MomentPostSchema.parse({
        id: post.id,
        authorKey: post.mine ? 'user' : anonymousActorKey(post.alias),
        authorName: post.alias,
        content: post.content,
        translation: post.translation,
        createdAt: post.createdAt,
        availableAt: 0,
      }),
    );
  const feed = momentTimeline(daily.activity, legacyPosts);
  const commentIds = new Set(feed.comments.map(comment => comment.id));
  for (const post of daily.posts)
    for (const comment of post.comments) {
      if (commentIds.has(comment.id) || daily.activity.deletedCommentIds.includes(comment.id)) continue;
      feed.comments.push(
        MomentCommentSchema.parse({
          id: comment.id,
          postId: post.id,
          authorKey: comment.mine || comment.alias === '匿名的我' ? 'user' : anonymousActorKey(comment.alias),
          authorName: comment.alias,
          content: comment.content,
          translation: comment.translation,
          createdAt: comment.createdAt,
          availableAt: 0,
          replyToAuthorName: comment.replyTo,
        }),
      );
    }
  return feed.posts
    .sort((a, b) => a.createdAt - b.createdAt)
    .filter(post => post.availableAt <= now)
    .map(post => ({
      id: post.id,
      alias: post.authorName,
      content: post.content,
      translation: post.translation,
      createdAt: post.createdAt,
      mine: post.authorKey === 'user',
      liked: daily.activity!.likes.includes(post.id),
      likeCount: feed.likes.filter(like => like.postId === post.id && like.availableAt <= now).length,
      comments: feed.comments
        .filter(comment => comment.postId === post.id && comment.availableAt <= now)
        .map(comment => ({
          id: comment.id,
          alias: comment.authorName,
          content: comment.content,
          translation: comment.translation,
          createdAt: comment.createdAt,
          replyTo: comment.replyToAuthorName,
          mine: comment.authorKey === 'user',
        })),
    }));
}
