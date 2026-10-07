import { z } from 'zod';
import type { momentTimeline } from './moments';
export const SpaceNotificationsSchema = z
  .object({
    initialized: z.boolean().default(false),
    seen: z.record(z.string(), z.number()).default({}),
    read: z.array(z.string()).default([]),
  })
  .prefault({});
export type SpaceNotice = {
  id: string;
  source: 'space' | 'hole';
  day: string;
  kind: 'post' | 'comment' | 'like';
  postId: string;
  commentId: string;
  actorKey: string;
  actorName: string;
  content: string;
  excerpt: string;
  thumbnail: string;
  createdAt: number;
  availableAt: number;
};
export function spaceNotices(
  feed: ReturnType<typeof momentTimeline>,
  source: 'space' | 'hole' = 'space',
  day = '',
): SpaceNotice[] {
  const result: SpaceNotice[] = [];
  const posts = new Map(
    feed.posts
      .filter(
        post =>
          post.authorKey === 'user' ||
          post.visibility === 'all' ||
          (post.visibility === 'include' && post.audience.includes('user')) ||
          (post.visibility === 'exclude' && !post.audience.includes('user')),
      )
      .map(post => [post.id, post]),
  );
  const comments = new Map(feed.comments.map(comment => [comment.id, comment]));
  const add = (
    kind: SpaceNotice['kind'],
    id: string,
    postId: string,
    actorKey: string,
    actorName: string,
    content: string,
    createdAt: number,
    availableAt: number,
    commentId = '',
  ) => {
    const post = posts.get(postId);
    if (!post || actorKey === 'user') return;
    result.push({
      id: `${source}:${day}:${kind}:${id}`,
      source,
      day,
      kind,
      postId,
      commentId,
      actorKey,
      actorName,
      content,
      excerpt: post.content || '图片动态',
      thumbnail: source === 'space' ? post.images.find(image => image.url)?.url || '' : '',
      createdAt,
      availableAt: Math.max(availableAt, post.availableAt),
    });
  };
  for (const post of feed.posts)
    add('post', post.id, post.id, post.authorKey, post.authorName, '发布了新动态', post.createdAt, post.availableAt);
  for (const comment of feed.comments) {
    const post = posts.get(comment.postId);
    if (
      post?.authorKey === 'user' ||
      comment.replyToAuthorKey === 'user' ||
      comments.get(comment.parentId)?.authorKey === 'user'
    )
      add(
        'comment',
        comment.id,
        comment.postId,
        comment.authorKey,
        comment.authorName,
        comment.content,
        comment.createdAt,
        comment.availableAt,
        comment.id,
      );
  }
  for (const like of feed.likes)
    if (posts.get(like.postId)?.authorKey === 'user')
      add(
        'like',
        like.id,
        like.postId,
        like.authorKey,
        like.authorName,
        '赞了你的动态',
        like.availableAt,
        like.availableAt,
      );
  return result;
}
export function reconcileSpaceNotices(
  state: z.infer<typeof SpaceNotificationsSchema>,
  notices: SpaceNotice[],
  now = Date.now(),
): boolean {
  let changed = !state.initialized;
  const read = new Set(state.read);
  for (const notice of notices) {
    if (Object.hasOwn(state.seen, notice.id)) continue;
    state.seen[notice.id] = state.initialized ? now : notice.createdAt || now;
    if (!state.initialized && notice.availableAt <= now) read.add(notice.id);
    changed = true;
  }
  if (changed) {
    state.initialized = true;
    state.read = [...read];
  }
  return changed;
}
