const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global.z = require('zod').z;
global._ = require('lodash');
const base = path.resolve(__dirname, '..');
const { MomentsStateSchema, MomentPostSchema, planMoments, syncMomentEvents, momentTimeline } = require(
  base + '/services/space/moments.ts',
);
const { ZonePageSchema, ZoneUpdateSchema } = require(base + '/services/space/zone.ts');
const { profileBadges } = require(base + '/services/space/profile-badges.ts');
const { buildMomentsPrompt, moduleGenerationRules } = require(base + '/prompts/index.ts');
const state = MomentsStateSchema.parse({
  settings: {
    followEnabled: true,
    strangerEnabled: true,
    npcEnabled: false,
    cooldownMinutes: 0,
    postProbability: 100,
    commentProbability: 100,
    likeProbability: 100,
    minInteractions: 3,
    maxInteractions: 3,
    minDelaySeconds: 0,
    maxDelaySeconds: 0,
  },
});
const posts = ['all', 'self', 'include'].map(visibility =>
  MomentPostSchema.parse({
    id: visibility,
    authorKey: 'user',
    authorName: '我',
    content: '一条动态',
    visibility,
    audience: ['friend'],
    createdAt: 1,
    availableAt: 0,
  }),
);
const plan = planMoments(state, [], posts, 10000, () => 0);
assert(plan.postActor.startsWith('npc:stranger:'));
assert(plan.actors.every(a => a.key.startsWith('npc:stranger:')));
assert([...plan.comments, ...plan.likes].every(t => t.postId === 'all'));
state.requests[plan.id] = plan;
const id = plan.postActor;
const batch = {
  request_id: plan.id,
  npcs: [
    { npcId: id, username: '远方旅人', profile: '住在另一座城市，爱种花。', avatarSeed: plan.actors[0].avatarSeed },
  ],
  posts: [{ authorKey: id, authorName: '远方旅人', content: '新芽长出来了。', delaySeconds: 0 }],
  comments: [],
  likes: [],
};
syncMomentEvents(state, ['<wave_moments>' + JSON.stringify(batch) + '</wave_moments>'], 10000);
assert.equal(state.npcs[id].username, '远方旅人');
assert.equal(momentTimeline(state).posts.length, 1);
const reuse = planMoments(state, [], posts, 11000, () => 0);
assert(reuse.actors.some(a => a.key === id && !a.isNew));
assert(buildMomentsPrompt(reuse, state, posts).includes('origin=stranger'));
assert(buildMomentsPrompt(reuse, state, posts).includes('"origin":"stranger"'));
state.settings.strangerEnabled = false;
assert.equal(
  planMoments(state, [], posts, 12000, () => 0),
  null,
);
state.settings.npcEnabled = true;
const scene = planMoments(state, [], posts, 13000, () => 0);
assert(scene.actors.every(a => a.key.startsWith('npc:ambient:')));
state.settings.strangerEnabled = true;
const both = planMoments(state, [], posts, 14000, () => 0);
assert(both.actors.some(a => a.key.startsWith('npc:ambient:')));
assert(both.actors.some(a => a.key === id));
const profile = ZonePageSchema.parse({
  profile: {
    title: '  离线终端  ',
    titleColor: 'bad',
    badges: ['unknown', ...profileBadges.slice(0, 5).map(b => b.id), profileBadges[0].id],
  },
}).profile;
assert.equal(profile.title, '离线终端');
assert.equal(profile.titleColor, '#ea91a4');
assert.equal(profile.badges.length, 4);
assert.equal(new Set(profile.badges).size, 4);
const patch = ZoneUpdateSchema.parse({
  profile: { badges: ['laptop'], titleColor: '#123abc' },
  posts: [
    {
      id: 'p',
      content: 'Hi',
      comments: [{ id: 'c', content: 'Hello', translation: { language: '中文', content: '你好' } }],
    },
  ],
});
assert.equal(patch.posts[0].comments[0].translation.content, '你好');
assert.deepEqual(patch.profile.badges, ['laptop']);
const contract = moduleGenerationRules({ moduleSettings: { zone: { syncChat: false, autoTranslate: true } } }, [
  'zone',
]);
assert(contract.includes('titleColor'));
assert(contract.includes('laptop'));
assert(contract.includes('每条评论与回复'));
assert(contract.includes('最多 4'));
assert.equal(profileBadges.length, 40);
assert(profileBadges.every(b => b.url.startsWith('data:image/svg+xml')));
console.log(
  'PASS: independent stranger/scene switches, private audience boundaries, stable NPC replay, profile decorations validation, comment translations and prompt contracts',
);
