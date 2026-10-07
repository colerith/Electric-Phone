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
global.SillyTavern = { name1: 'User', characterId: '1', getCurrentChatId: () => 'test' };
global.getCharData = () => ({ name: 'Alice' });
global.getCharAvatarPath = () => '';
global.getChatMessages = () => [];
const vars = { global: {}, script: {}, chat: {} };
global.getVariables = ({ type }) => vars[type];
global.replaceVariables = (v, { type }) => (vars[type] = v);
const schema = require('../schemas.ts');
const {
  MomentsStateSchema,
  planMoments,
  validMomentPosts,
  syncMomentEvents,
  momentTimeline,
} = require('../services/space/moments.ts');
const { validateManualZonePosts } = require('../services/space/zone.ts');
const { buildMomentsPrompt } = require('../prompts/index.ts');
const { generateZonePage } = require('../services/generation/generation.ts');
const actors = ['alice', 'bob'].map(name =>
  schema.IdentitySchema.parse({
    charKey: name,
    name,
    source: 'local_contact',
    actorType: 'main',
    createdAt: '',
    updatedAt: '',
  }),
);
const state = MomentsStateSchema.parse({
  settings: { postingCharKeys: ['alice', 'bob'], npcEnabled: false, strangerEnabled: false },
});
const plan = planMoments(state, actors, [], 1000, () => 0, { force: true, newPosts: 3 });
assert.equal(plan.postTasks.length, 3);
assert.equal(new Set(plan.postTasks).size, 2);
assert(!validMomentPosts({ posts: [] }, plan));
const batch = {
  request_id: plan.id,
  posts: plan.postTasks.map((authorKey, i) => ({ authorKey, authorName: authorKey, content: 'new ' + i })),
  comments: [],
  likes: [],
  npcs: [],
};
assert(validMomentPosts(batch, plan));
assert(!validMomentPosts({ ...batch, posts: batch.posts.slice(0, 1) }, plan));
state.requests[plan.id] = plan;
syncMomentEvents(state, ['<wave_moments>' + JSON.stringify(batch) + '</wave_moments>']);
assert.equal(momentTimeline(state).posts.length, 3);
assert(buildMomentsPrompt(plan, state, []).includes('必须新增 3 条'));
assert.equal(
  planMoments(state, actors, [], 2000, () => 0, { force: true, newPosts: 0 }),
  null,
);
const previous = JSON.stringify({ posts: [{ id: 'old', content: 'old content' }] });
assert.throws(() => validateManualZonePosts({ posts: [{ id: 'old', content: 'changed' }] }, previous, 3));
validateManualZonePosts({ posts: [{ id: 'old', content: 'changed' }] }, previous, 0);
(async () => {
  const settings = schema.ScriptSettingsSchema.parse({
    api: { enabled: true, apiurl: 'https://example.com/v1', key: 'fake', model: 'test', retryCount: 0 },
  });
  const input = {
    settings,
    cardKey: 'character:1',
    chatKey: 'test',
    cardName: 'Alice',
    identity: actors[0],
    thread: schema.ThreadSchema.parse({ id: 't', charKey: 'alice', updatedAt: '' }),
    appSnapshot: schema.AppSnapshotSchema.parse({}),
    latestUserText: '更新动态',
  };
  let calls = 0;
  global.generateRaw = async () =>
    JSON.stringify(
      ++calls === 1
        ? { profile: { username: 'Alice' }, posts: [] }
        : { posts: [0, 1, 2].map(i => ({ id: 'p' + i, content: 'new ' + i })) },
    );
  const page = await generateZonePage(input);
  assert.equal(page.posts.length, 3);
  assert.equal(calls, 2, 'like-only/empty result triggers one correction');
  calls = 0;
  global.generateRaw = async () => {
    calls++;
    return JSON.stringify({ posts: [] });
  };
  await assert.rejects(generateZonePage(input), /新增 3/);
  assert.equal(calls, 2, 'bounded retries');
  settings.moduleSettings.zone.maxNew = 0;
  calls = 0;
  await generateZonePage(input);
  assert.equal(calls, 1);
  console.log('PASS manual 3-post actor slots, replay, zero cap, old-post exclusion, and bounded corrective retry');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
