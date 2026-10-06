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
global.SillyTavern = { name1: 'User' };
const { buildPhonePrompts, buildModulePrompt, buildMomentsPrompt } = require('../prompts/index.ts');
const { compactProfileBadgePrompt, profileBadgePrompt } = require('../services/space/profile-badges.ts');
const { MomentsStateSchema } = require('../services/space/moments.ts');
const input = {
  cardKey: 'card',
  chatKey: 'chat',
  cardName: 'Card',
  identity: { charKey: 'alice', name: 'Alice' },
  thread: { id: 'thread', messages: [], historyArchive: [] },
  appSnapshot: {
    status: 'STATUS_SENTINEL',
    zone: JSON.stringify({ posts: [{ id: 'post', content: 'ZONE_SENTINEL', comments: [] }] }),
    memo: 'MEMO_SENTINEL',
    calendar: 'CALENDAR_SENTINEL',
    browse: 'BROWSE_SENTINEL',
    wallet: 'WALLET_SENTINEL',
    music: 'MUSIC_SENTINEL',
  },
  availableStickers: 'STICKER_SENTINEL',
  zoneInteractions: { post: 'COMMENT_SENTINEL' },
};
const text = prompts =>
  prompts
    .filter(p => typeof p !== 'string')
    .map(p => p.content)
    .join('\n');
const chat = text(buildPhonePrompts(input));
assert(chat.includes('STATUS_SENTINEL'));
assert.equal(chat.split('STICKER_SENTINEL').length - 1, 1);
for (const name of ['ZONE', 'MEMO', 'CALENDAR', 'BROWSE', 'WALLET', 'MUSIC', 'COMMENT'])
  assert(!chat.includes(name + '_SENTINEL'), name);
assert(!chat.includes('评论语言继承') && !chat.includes('跨 App 更新路由'));
for (const module of ['messages', 'status', 'memo', 'zone', 'wallet', 'calendar', 'browse', 'music']) {
  for (const follow of [false, true]) {
    const prompt = buildModulePrompt(input, [module], follow);
    for (const other of ['status', 'memo', 'zone', 'wallet', 'calendar', 'browse', 'music'])
      if (other !== module) assert(!prompt.includes(other.toUpperCase() + '_SENTINEL'), module + ' leaks ' + other);
    if (module !== 'zone') assert(!prompt.includes('评论语言继承') && !prompt.includes('COMMENT_SENTINEL'));
    assert.equal(prompt.includes('STICKER_SENTINEL'), module === 'messages');
  }
}
const zone = text(buildPhonePrompts(input, 'zone'));
assert(zone.includes('ZONE_SENTINEL') && zone.includes('COMMENT_SENTINEL'));
assert(!zone.includes('STATUS_SENTINEL') && !zone.includes('STICKER_SENTINEL'));
const compact = compactProfileBadgePrompt({});
assert(compact.length < profileBadgePrompt.length / 2);
assert(!compactProfileBadgePrompt({ title: '已有称号', badges: ['sleeping-face'] }).includes('sleeping-face='));
const plan = {
  id: 'request',
  user: { name: 'User' },
  actors: [],
  comments: [],
  likes: [],
  postActor: null,
  interactionLimit: 2,
  minDelay: 0,
  maxDelay: 30,
};
const moments = buildMomentsPrompt(plan, MomentsStateSchema.parse({}), []);
assert(!moments.includes('每个标签不含') && !moments.includes('用户外貌资料'));
assert(moments.includes('posts 必须为 []'));
console.log(
  'PASS prompt scope for manual/follow/chat/zone, single sticker catalog, compact profile and interaction-only rules',
);
