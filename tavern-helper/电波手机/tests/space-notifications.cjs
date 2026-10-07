const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
global.window = global;

const { SpaceNotificationsSchema, spaceNotices, reconcileSpaceNotices } = require('../services/space/notifications.ts');
const { MomentPostSchema } = require('../services/space/moments.ts');
const post = (id, authorKey) =>
  MomentPostSchema.parse({ id, authorKey, authorName: authorKey, content: id, createdAt: 1, availableAt: 0 });
const feed = {
  posts: [post('own', 'user'), post('other', 'char')],
  comments: [
    { id: 'mine', postId: 'other', authorKey: 'user', content: '我的评论', availableAt: 0, createdAt: 2 },
    {
      id: 'reply',
      postId: 'other',
      authorKey: 'char',
      authorName: '角色',
      parentId: 'mine',
      content: '回复你',
      availableAt: 500,
      createdAt: 500,
    },
    { id: 'irrelevant', postId: 'other', authorKey: 'guest', content: '与我无关', availableAt: 0, createdAt: 2 },
    {
      id: 'to-me',
      postId: 'own',
      authorKey: 'char',
      authorName: '角色',
      content: '评论我的帖子',
      availableAt: 0,
      createdAt: 3,
    },
  ],
  likes: [
    { id: 'like', postId: 'own', authorKey: 'char', authorName: '角色', availableAt: 0 },
    { id: 'self-like', postId: 'other', authorKey: 'user', availableAt: 0 },
  ],
};
const notices = spaceNotices(feed);
assert.equal(notices.length, 4);
assert(notices.some(n => n.commentId === 'reply'));
assert(!notices.some(n => n.commentId === 'irrelevant'));
const state = SpaceNotificationsSchema.parse({});
assert(reconcileSpaceNotices(state, notices, 100));
assert.equal(state.read.length, 3, 'historical visible events start read; delayed event stays unread');
assert(!reconcileSpaceNotices(state, notices, 101), 'same events cause no extra save');
feed.posts.push(post('new', 'friend'));
const next = spaceNotices(feed);
assert(reconcileSpaceNotices(state, next, 200));
assert(!state.read.includes(next.find(n => n.postId === 'new').id));
const hole = spaceNotices(feed, 'hole', '2026-10-07');
assert(hole.every(n => n.source === 'hole' && !n.thumbnail));
assert(
  hole.every(n => !next.some(other => other.id === n.id)),
  'channels never collide',
);
feed.posts.push({ ...post('private', 'char'), visibility: 'self' });
assert(!spaceNotices(feed).some(n => n.postId === 'private'));
assert.deepEqual(SpaceNotificationsSchema.parse(JSON.parse(JSON.stringify(state))), state);
console.log(
  'PASS notification relevance, private visibility, anonymous channel separation, deduplication, baseline/read persistence and delayed unread',
);
