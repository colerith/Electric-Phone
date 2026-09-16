import { bilingual, TranslationSchema } from './module-settings';
import { npcAvatarSeed } from './npc-avatar';
import { splitElectric } from './electric';
import { z } from 'zod';
import type { Identity } from '../schemas';
export const MomentMediaSchema = z
  .object({
    kind: z.enum(['image', 'description']),
    url: z.string().default(''),
    description: z.string().max(1000).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'image' && !/^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(value.url))
      ctx.addIssue({ code: 'custom', message: '图片地址无效' });
    if (value.kind === 'description' && !value.description.trim())
      ctx.addIssue({ code: 'custom', message: '请填写图片描述' });
  });
export const MomentPostSchema = z.object({
  id: z.string(),
  authorKey: z.string(),
  authorName: z.string(),
  content: z.string().max(5000).default(''),
  translation: TranslationSchema.optional(),
  images: z.array(MomentMediaSchema).max(9).default([]),
  location: z.string().max(200).default(''),
  mentions: z.array(z.string()).default([]),
  visibility: z.enum(['all', 'self', 'include', 'exclude']).default('all'),
  audience: z.array(z.string()).default([]),
  createdAt: z.number(),
  availableAt: z.number(),
});
export const MomentCommentSchema = z.object({
  id: z.string(),
  postId: z.string(),
  authorKey: z.string(),
  authorName: z.string(),
  content: z.string().min(1).max(1000),
  translation: TranslationSchema.optional(),
  createdAt: z.number(),
  availableAt: z.number(),
  parentId: z.string().default(''),
  replyToAuthorKey: z.string().default(''),
  replyToAuthorName: z.string().default(''),
});
export const MomentNpcSchema = z.object({
  npcId: z.string().min(1),
  username: z.string().trim().min(1).max(40),
  profile: z.string().max(10000).default(''),
  avatarSeed: z.string().default(''),
});
const ActorSchema = z.object({
  isNew: z.boolean().default(false),
  avatarSeed: z.string().default(''),
  key: z.string(),
  name: z.string(),
  about: z.string().default(''),
  relationshipToUser: z.string().default(''),
  npc: z.boolean().default(false),
});
export const MomentPlanSchema = z.object({
  id: z.string(),
  actors: z.array(ActorSchema),
  postActor: z.string().nullable(),
  user: z.object({ key: z.literal('user'), name: z.string() }).default({ key: 'user', name: 'User' }),
  reservedNames: z.array(z.string()).default([]),
  likes: z.array(z.object({ actorKey: z.string(), postId: z.string() })).default([]),
  interactionLimit: z.number().int().min(1).max(3).default(1),
  comments: z
    .array(z.object({ actorKey: z.string(), postId: z.string(), replyToCommentId: z.string().default('') }))
    .default([]),
  createdAt: z.number(),
  minDelay: z.number(),
  maxDelay: z.number(),
});
const LikeEventSchema = z.object({
  authorKey: z.string(),
  authorName: z.string().default(''),
  postId: z.string(),
  delaySeconds: z.number().min(0).max(86400).default(0),
});
export const MomentBatchSchema = z.object({
  npcs: z
    .array(MomentNpcSchema.extend({ profile: z.string().max(2000).default('') }))
    .max(1)
    .default([]),
  likes: z.array(LikeEventSchema).max(3).default([]),
  request_id: z.string(),
  posts: z
    .array(
      z.object({
        authorKey: z.string(),
        authorName: z.string().default(''),
        content: z.string().min(1).max(3000),
        translation: TranslationSchema.optional(),
        images: z.array(z.string().min(1).max(600)).max(9).default([]),
        location: z.string().max(200).default(''),
        delaySeconds: z.number().min(0).max(86400).default(0),
      }),
    )
    .max(1)
    .default([]),
  comments: z
    .array(
      z.object({
        authorKey: z.string(),
        authorName: z.string().default(''),
        postId: z.string(),
        replyToCommentId: z.string().default(''),
        content: z.string().min(1).max(500),
        translation: TranslationSchema.optional(),
        delaySeconds: z.number().min(0).max(86400).default(0),
      }),
    )
    .max(3)
    .default([]),
});
export const MomentUserProfileSchema = z
  .object({
    nickname: z.string().max(40).default(''),
    account: z.string().max(40).default(''),
    avatar: z.string().default(''),
    signature: z.string().max(240).default(''),
    cover: z.string().default(''),
  })
  .prefault({});
export const MomentUserProfileMapSchema = z.record(z.string(), MomentUserProfileSchema).prefault({});
export type MomentUserProfile = z.infer<typeof MomentUserProfileSchema>;

export const MomentsStateSchema = z
  .object({
    npcs: z.record(z.string(), MomentNpcSchema).default({}),
    profile: MomentUserProfileSchema,
    settings: z
      .object({
        ...bilingual,
        followEnabled: z.boolean().default(false),
        postingCharKeys: z.array(z.string()).default([]),
        npcEnabled: z.boolean().default(false),
        npcRules: z
          .string()
          .max(2000)
          .default('只生成与当前生活场景有合理联系的普通 NPC；不冒充已有角色，不知道私密聊天。'),
        postProbability: z.number().min(0).max(100).default(35),
        likeProbability: z.number().min(0).max(100).default(60),
        minInteractions: z.number().int().min(1).max(3).default(1),
        maxInteractions: z.number().int().min(1).max(3).default(3),
        commentProbability: z.number().min(0).max(100).default(50),
        cooldownMinutes: z.number().min(0).max(1440).default(10),
        minDelaySeconds: z.number().min(0).max(3600).default(15),
        maxDelaySeconds: z.number().min(0).max(86400).default(120),
      })
      .prefault({}),
    posts: z.array(MomentPostSchema).default([]),
    comments: z.array(MomentCommentSchema).default([]),
    likes: z.array(z.string()).default([]),
    requests: z.record(z.string(), MomentPlanSchema).default({}),
    events: z
      .array(
        z.object({
          requestId: z.string(),
          batch: MomentBatchSchema,
          receivedAt: z.number(),
          independent: z.boolean().default(false),
        }),
      )
      .default([]),
    deletedPostIds: z.array(z.string()).default([]),
    lastRequestAt: z.number().default(0),
  })
  .prefault({});
export type MomentsState = z.infer<typeof MomentsStateSchema>;
export type MomentPost = z.infer<typeof MomentPostSchema>;
export type MomentComment = z.infer<typeof MomentCommentSchema>;
export type MomentPlan = z.infer<typeof MomentPlanSchema>;
export type MomentMedia = z.infer<typeof MomentMediaSchema>;
export const MOMENTS_PATTERN = /<wave_moments>\s*([\s\S]*?)\s*<\/wave_moments>/g;
export function canSeeMoment(post: MomentPost, key: string): boolean {
  return (
    key === 'user' ||
    key === post.authorKey ||
    post.visibility === 'all' ||
    (post.visibility === 'include' && post.audience.includes(key)) ||
    (post.visibility === 'exclude' && !post.audience.includes(key))
  );
}
export function planMoments(
  state: MomentsState,
  identities: Identity[],
  posts: MomentPost[],
  now = Date.now(),
  random = Math.random,
  options: { force?: boolean } = {},
): MomentPlan | null {
  const settings = state.settings;
  if (!options.force && (!settings.followEnabled || now - state.lastRequestAt < settings.cooldownMinutes * 60000))
    return null;
  const actors = identities
    .filter(identity => identity.source !== 'local_group' && settings.postingCharKeys.includes(identity.charKey))
    .map(identity => ({
      isNew: false,
      avatarSeed: state.npcs[identity.charKey]?.avatarSeed || '',
      key: identity.charKey,
      name: identity.name,
      about: identity.actorType === 'npc' ? identity.npcProfile || identity.about || '' : identity.about || '',
      relationshipToUser: identity.relationshipToUser || '',
      npc: identity.actorType === 'npc',
    }));
  if (settings.npcEnabled) {
    for (const npc of Object.values(state.npcs).slice(-20)) {
      // Friends follow the explicit posting-character selection, not the ambient NPC switch.
      if (identities.some(identity => identity.charKey === npc.npcId)) continue;
      actors.push({
        key: npc.npcId,
        name: npc.username,
        about: npc.profile,
        npc: true,
        isNew: false,
        avatarSeed: npc.avatarSeed,
        relationshipToUser: '未建立关系',
      });
    }
    let key = `npc:ambient:${now}-${Math.floor(random() * 1e9).toString(36)}`;
    while (state.npcs[key] || identities.some(identity => identity.charKey === key)) key += '-new';
    actors.push({
      key,
      name: '场景 NPC',
      about: settings.npcRules,
      relationshipToUser: '未建立关系',
      npc: true,
      isNew: true,
      avatarSeed: npcAvatarSeed(key),
    });
  }
  if (!actors.length) return null;
  const pick = <T>(list: T[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
  const postActor = options.force
    ? pick(actors).key
    : random() * 100 < settings.postProbability
      ? pick(actors).key
      : null;
  const comments: MomentPlan['comments'] = [],
    likes: MomentPlan['likes'] = [];
  const low = Math.min(settings.minInteractions, settings.maxInteractions),
    high = Math.max(settings.minInteractions, settings.maxInteractions);
  const interactionLimit = low + Math.min(high - low, Math.floor(random() * (high - low + 1)));
  const existingLikes = momentTimeline(state).likes;
  const targets = posts
    .filter(post => post.availableAt <= now)
    .slice(0, 20)
    .flatMap(post =>
      actors
        .filter(actor => actor.key !== post.authorKey && canSeeMoment(post, actor.key))
        .map(actor => ({ actorKey: actor.key, postId: post.id })),
    );
  const candidates = targets.flatMap(target => [
    ...(random() * 100 < settings.commentProbability ? [{ ...target, kind: 'comment' as const }] : []),
    ...(random() * 100 < settings.likeProbability &&
    !existingLikes.some(like => like.postId === target.postId && like.authorKey === target.actorKey)
      ? [{ ...target, kind: 'like' as const }]
      : []),
  ]);
  while (candidates.length && comments.length + likes.length < interactionLimit) {
    const selected = pick(candidates);
    candidates.splice(candidates.indexOf(selected), 1);
    if (selected.kind === 'like') likes.push({ actorKey: selected.actorKey, postId: selected.postId });
    else comments.push({ actorKey: selected.actorKey, postId: selected.postId, replyToCommentId: '' });
  }
  if (!postActor && !comments.length && !likes.length) return null;
  return {
    id: `moments-${now}-${Math.floor(random() * 1e9).toString(36)}`,
    actors,
    postActor,
    user: {
      key: 'user',
      name: state.profile.nickname || (typeof SillyTavern !== 'undefined' ? SillyTavern.name1 : 'User') || 'User',
    },
    reservedNames: identities.map(identity => identity.name),
    likes,
    interactionLimit,
    comments,
    createdAt: now,
    minDelay: options.force ? 0 : settings.minDelaySeconds,
    maxDelay: options.force ? 0 : Math.max(settings.minDelaySeconds, settings.maxDelaySeconds),
  };
}

/** Build a single, targeted reply plan after User comments or replies in Moments. */
export function planMomentReply(
  state: MomentsState,
  identities: Identity[],
  posts: MomentPost[],
  postId: string,
  triggerCommentId: string,
  now = Date.now(),
): MomentPlan | null {
  const post = posts.find(item => item.id === postId);
  const trigger = state.comments.find(comment => comment.id === triggerCommentId);
  if (!post || !trigger) return null;
  const parent = trigger.parentId ? momentTimeline(state).comments.find(comment => comment.id === trigger.parentId) : null;
  const actorKey =
    (parent?.authorKey && parent.authorKey !== 'user' ? parent.authorKey : '') ||
    (post.authorKey !== 'user' ? post.authorKey : '') ||
    state.settings.postingCharKeys.find(key => key !== 'user') ||
    '';
  if (!actorKey) return null;
  const identity = identities.find(item => item.charKey === actorKey);
  const npc = state.npcs[actorKey];
  if (!identity && !npc) return null;
  const actor = identity
    ? {
        isNew: false,
        avatarSeed: npc?.avatarSeed || '',
        key: actorKey,
        name: identity.name,
        about: identity.actorType === 'npc' ? identity.npcProfile || identity.about || '' : identity.about || '',
        relationshipToUser: identity.relationshipToUser || '',
        npc: identity.actorType === 'npc',
      }
    : {
        isNew: false,
        avatarSeed: npc!.avatarSeed,
        key: actorKey,
        name: npc!.username,
        about: npc!.profile,
        relationshipToUser: '未建立关系',
        npc: true,
      };
  return MomentPlanSchema.parse({
    id: `moments-reply-${now}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    actors: [actor],
    postActor: null,
    user: {
      key: 'user',
      name: state.profile.nickname || (typeof SillyTavern !== 'undefined' ? SillyTavern.name1 : 'User') || 'User',
    },
    reservedNames: identities.map(item => item.name),
    likes: [],
    interactionLimit: 1,
    comments: [{ actorKey, postId, replyToCommentId: triggerCommentId }],
    createdAt: now,
    minDelay: 0,
    maxDelay: 0,
  });
}
export function syncMomentEvents(state: MomentsState, messages: string[], now = Date.now()): void {
  // Persist the identities of previously validated legacy NPC events before rebuilding floors.
  for (const event of state.events) {
    for (const author of [...event.batch.posts, ...event.batch.comments, ...event.batch.likes]) {
      if (!author.authorKey.startsWith('npc:ambient') || !author.authorName.trim() || state.npcs[author.authorKey])
        continue;
      state.npcs[author.authorKey] = {
        npcId: author.authorKey,
        username: author.authorName.trim(),
        profile: event.batch.npcs?.find(npc => npc.npcId === author.authorKey)?.profile || '',
        avatarSeed: npcAvatarSeed(author.authorKey),
      };
    }
  }
  const old = new Map(state.events.map(event => [event.requestId, event]));
  const next = new Map<string, MomentsState['events'][number]>(
    state.events.filter(event => event.independent).map(event => [event.requestId, event]),
  );
  for (const text of messages)
    for (const match of splitElectric(text).body.matchAll(new RegExp(MOMENTS_PATTERN.source, 'g'))) {
      try {
        const batch = MomentBatchSchema.parse(JSON.parse(match[1]!));
        const plan = state.requests[batch.request_id];
        if (!plan) continue;
        const interactions = [
          ...batch.comments.map(item => ({ ...item, kind: 'comment' })),
          ...batch.likes.map(item => ({ ...item, kind: 'like' })),
        ];
        if (
          interactions.length > plan.interactionLimit ||
          new Set(interactions.map(item => `${item.kind}:${item.authorKey}:${item.postId}`)).size !==
            interactions.length
        )
          continue;
        if (
          batch.likes.some(
            like => !plan.likes.some(target => target.actorKey === like.authorKey && target.postId === like.postId),
          )
        )
          continue;
        if (
          batch.posts.some(post => post.authorKey !== plan.postActor) ||
          batch.comments.some(
            comment =>
              !plan.comments.some(
                target =>
                  target.actorKey === comment.authorKey &&
                  target.postId === comment.postId &&
                  (target.replyToCommentId || '') === comment.replyToCommentId,
              ),
          )
        )
          continue;
        const events = [...batch.posts, ...batch.comments, ...batch.likes];
        const keys = new Set(events.map(event => event.authorKey));
        const newActors = plan.actors.filter(actor => actor.isNew && keys.has(actor.key));
        if (newActors.some(actor => !batch.npcs.some(npc => npc.npcId === actor.key && npc.profile.trim()))) continue;
        if (
          batch.npcs.some(
            npc =>
              !newActors.some(actor => actor.key === npc.npcId) ||
              (npc.avatarSeed && npc.avatarSeed !== npcAvatarSeed(npc.npcId)),
          )
        )
          continue;
        let valid = true;
        const discovered: Record<string, z.infer<typeof MomentNpcSchema>> = {};
        for (const event of events) {
          const actor = plan.actors.find(actor => actor.key === event.authorKey);
          if (!actor || event.authorKey === 'user') {
            valid = false;
            break;
          }
          if (!event.authorKey.startsWith('npc:ambient')) continue;
          const previous = state.npcs[event.authorKey];
          const metadata = batch.npcs.find(npc => npc.npcId === event.authorKey);
          const username = previous?.username || metadata?.username || event.authorName.trim();
          if (
            !username ||
            (!previous &&
              ['user', 'char', 'npc', plan.user.name, ...plan.reservedNames].some(
                name => name.trim().toLowerCase() === username.toLowerCase(),
              )) ||
            (event.authorName && event.authorName.trim() !== username)
          ) {
            valid = false;
            break;
          }
          if (discovered[event.authorKey] && discovered[event.authorKey].username !== username) {
            valid = false;
            break;
          }
          discovered[event.authorKey] = previous || {
            npcId: event.authorKey,
            username,
            profile: metadata?.profile || '',
            avatarSeed: npcAvatarSeed(event.authorKey),
          };
        }
        if (!valid) continue;
        Object.assign(state.npcs, discovered);
        next.set(batch.request_id, {
          requestId: batch.request_id,
          batch,
          receivedAt: old.get(batch.request_id)?.receivedAt ?? now,
          independent: old.get(batch.request_id)?.independent ?? false,
        });
      } catch {
        /* Ignore incomplete streamed or invalid batches. */
      }
    }
  state.events = [...next.values()];
}
export function momentTimeline(state: MomentsState, legacy: MomentPost[] = []) {
  const posts = [...state.posts, ...legacy];
  const comments = [...state.comments];
  const likes: Array<{ id: string; postId: string; authorKey: string; authorName: string; availableAt: number }> =
    state.likes.map(postId => ({
      id: `user:${postId}`,
      postId,
      authorKey: 'user',
      authorName: state.profile.nickname || '我',
      availableAt: 0,
    }));
  for (const event of state.events) {
    const plan = state.requests[event.requestId];
    if (!plan) continue;
    const time = (delay: number) => event.receivedAt + Math.max(plan.minDelay, Math.min(plan.maxDelay, delay)) * 1000;
    const name = (key: string, raw: string) =>
      state.npcs[key]?.username ||
      (key.startsWith('npc:ambient') ? raw : plan.actors.find(actor => actor.key === key)?.name || '');
    event.batch.posts.forEach((post, index) =>
      posts.push({
        id: `${event.requestId}:post:${index}`,
        authorKey: post.authorKey,
        authorName: name(post.authorKey, post.authorName),
        content: post.content,
        translation: post.translation,
        images: post.images.map(description => ({ kind: 'description', url: '', description })),
        location: post.location,
        mentions: [],
        visibility: 'all',
        audience: [],
        createdAt: time(post.delaySeconds),
        availableAt: time(post.delaySeconds),
      }),
    );
  }
  for (const event of state.events) {
    const plan = state.requests[event.requestId];
    if (!plan) continue;
    event.batch.comments.forEach((comment, index) => {
      const target = posts.find(post => post.id === comment.postId);
      if (!target || !canSeeMoment(target, comment.authorKey)) return;
      const when = event.receivedAt + Math.max(plan.minDelay, Math.min(plan.maxDelay, comment.delaySeconds)) * 1000;
      const actor = plan.actors.find(actor => actor.key === comment.authorKey);
      comments.push({
        id: `${event.requestId}:comment:${index}`,
        postId: comment.postId,
        authorKey: comment.authorKey,
        authorName:
          state.npcs[comment.authorKey]?.username ||
          (comment.authorKey.startsWith('npc:ambient') ? comment.authorName : actor?.name || ''),
        content: comment.content,
        translation: comment.translation,
        createdAt: when,
        availableAt: when,
        parentId: comment.replyToCommentId,
        replyToAuthorKey: comments.find(item => item.id === comment.replyToCommentId)?.authorKey || '',
        replyToAuthorName: comments.find(item => item.id === comment.replyToCommentId)?.authorName || '',
      });
    });
  }
  for (const event of state.events) {
    const plan = state.requests[event.requestId];
    if (!plan) continue;
    event.batch.likes.forEach((like, index) => {
      const target = posts.find(post => post.id === like.postId);
      if (
        !target ||
        !canSeeMoment(target, like.authorKey) ||
        likes.some(item => item.postId === like.postId && item.authorKey === like.authorKey)
      )
        return;
      const actor = plan.actors.find(item => item.key === like.authorKey);
      likes.push({
        id: `${event.requestId}:like:${index}`,
        postId: like.postId,
        authorKey: like.authorKey,
        authorName:
          state.npcs[like.authorKey]?.username ||
          (like.authorKey.startsWith('npc:ambient') ? like.authorName : actor?.name || ''),
        availableAt: event.receivedAt + Math.max(plan.minDelay, Math.min(plan.maxDelay, like.delaySeconds)) * 1000,
      });
    });
  }
  const deleted = new Set(state.deletedPostIds);
  const visiblePosts = posts.filter(post => !deleted.has(post.id));
  const visibleIds = new Set(visiblePosts.map(post => post.id));
  return {
    posts: visiblePosts.sort((a, b) => b.createdAt - a.createdAt),
    comments: comments.filter(comment => visibleIds.has(comment.postId)),
    likes: likes.filter(like => visibleIds.has(like.postId)),
  };
}
