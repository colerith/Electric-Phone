const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' });
for (const key of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
])
  global[key] = dom.window[key];
const compile = code =>
  ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const { parse, compileScript } = require('vue/compiler-sfc');
require.extensions['.vue'] = (m, f) => {
  const { descriptor } = parse(fs.readFileSync(f, 'utf8'));
  m._compile(compile(compileScript(descriptor, { id: f, inlineTemplate: true }).content), f);
};
global._ = require('lodash');
global.z = require('zod').z;
let chatKey = 'test';
let vars = { script: {}, global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chatKey, characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');

const { usePhoneStore } = require(base + '/stores/phone.ts'),
  Moments = require(base + '/components/space/WaveTreeHole.vue').default,
  { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const {
  MomentsStateSchema,
  MomentPostSchema,
  MomentCommentSchema,
  planMoments,
  planMomentReply,
  syncMomentEvents,
  momentTimeline,
  canSeeMoment,
} = require(base + '/services/space/moments.ts');
const { buildMomentsPrompt } = require(base + '/prompts/moments.ts');
const { contactLetter } = require(base + '/services/chat/contact-alphabet.ts');
let phone, component;
const surface = vue.ref(null),
  view = vue.ref('feed');
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h(
        'section',
        { ref: surface },
        vue.h(Moments, {
          key: view.value,
          ref: v => (component = v),
          view: view.value,
          context: 'space',
          userName: 'User',
          userAvatar: '',
        }),
      );
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const clickText = (selector, text) => {
  const button = [...document.querySelectorAll(selector)].find(el => el.textContent.includes(text));
  assert(button, 'missing ' + text);
  button.click();
};
const input = (el, text) => {
  assert(el);
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const { treeHoleDay, TreeHolePostSchema, TreeHoleStateSchema, anonymousActorKey } = require(
  base + '/services/space/tree-hole.ts',
);
(async () => {
  await phone.synchronize();
  const day = treeHoleDay(),
    key = phone.activeIdentity.charKey;
  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://example.com/v1';
  phone.settings.api.key = 'fake';
  phone.settings.api.model = 'test';
  phone.settings.api.retryCount = 0;
  phone.settings.moduleSettings.zone.maxNew = 2;
  Object.assign(phone.state.moments.settings, {
    postingCharKeys: [key],
    npcEnabled: false,
    strangerEnabled: false,
    minInteractions: 1,
    maxInteractions: 1,
    likeProbability: 0,
    commentProbability: 100,
    autoUserInteractions: false,
  });
  phone.state.treeHole[day] = {
    topic: '小小的温暖',
    posts: [
      TreeHolePostSchema.parse({
        id: 'old',
        alias: '匿名甲',
        content: '旧树洞内容',
        createdAt: 1,
        liked: true,
        comments: [{ id: 'old-comment', alias: '匿名乙', content: '旧回应', createdAt: 2, replyTo: '匿名甲' }],
      }),
    ],
  };
  let calls = 0,
    lastRequest;
  global.generateRaw = async args => {
    calls++;
    assert.equal(args.max_chat_history, 0);
    assert(args.ordered_prompts.every(p => typeof p !== 'string'));
    const prompt = args.ordered_prompts.map(p => p.content).join('\n');
    assert(!prompt.includes('Alice'), 'no real character name in anonymous prompt');
    assert(prompt.includes('所有 images=[]'));
    const line = prompt.split('\n').find(line => line.startsWith('{"protocol":"wave_tree_hole_request_v1"'));
    assert(line, 'anonymous request protocol');
    const req = JSON.parse(line);
    lastRequest = req;
    const author = id => req.actors.find(a => a.key === id).name;
    return JSON.stringify({
      request_id: req.request_id,
      npcs: [],
      posts: (req.postTasks || []).map((id, index) => ({
        authorKey: id,
        authorName: author(id),
        content: `新匿名动态 ${calls}-${index}`,
        images: [],
        delaySeconds: 0,
      })),
      comments: req.tasks
        .filter(t => t.action === 'comment')
        .map(t => ({
          authorKey: t.actorKey,
          authorName: author(t.actorKey),
          postId: t.target.postId,
          replyToCommentId: t.target.replyToCommentId,
          content: '承接回应',
          delaySeconds: 0,
        })),
      likes: req.tasks
        .filter(t => t.action === 'like')
        .map(t => ({
          authorKey: t.actorKey,
          authorName: author(t.actorKey),
          postId: t.target.postId,
          delaySeconds: 0,
        })),
    });
  };
  await phone.refreshTreeHole(day);
  assert.equal(phone.treeHoleFeed(day).length, 3, 'manual count follows slider');
  assert.equal(phone.state.treeHole[day].posts.length, 0, 'legacy moved once');
  const old = phone.treeHoleFeed(day).find(p => p.id === 'old');
  assert(old.liked && old.comments.some(c => c.id === 'old-comment' && c.replyTo === '匿名甲'));
  TreeHoleStateSchema.parse(phone.state.treeHole);
  await phone.refreshTreeHole(day, 'old', 'old-comment');
  assert.equal(lastRequest.postActorKey, null);
  assert(lastRequest.tasks.every(t => t.target.replyToCommentId === 'old-comment'));
  assert(
    phone
      .treeHoleFeed(day)
      .find(p => p.id === 'old')
      .comments.some(c => c.replyTo === '匿名乙'),
  );
  await tick();
  assert.equal(document.querySelectorAll('.space-hole-actions').length, 3);
  assert.equal(document.querySelectorAll('.space-hole-actions .hole-secondary-actions').length, 3);
  assert(document.querySelector('.space-hole-meta time'));
  assert([...document.querySelectorAll('.hole-comment-actions button')].some(b => b.textContent.trim() === '触发互动'));
  phone.settings.moduleSettings.zone.maxNew = 0;
  await phone.refreshTreeHole(day);
  assert.equal(phone.treeHoleFeed(day).length, 3, 'zero cap only interacts');
  const previousCalls = calls;
  phone.state.moments.settings.autoUserInteractions = true;
  phone.publishTreeHole('我发布的新内容', day);
  for (let i = 0; i < 30 && (calls === previousCalls || phone.moduleGenerating); i++)
    await new Promise(r => setTimeout(r, 5));
  assert(calls > previousCalls, 'publishing automatically schedules interaction');
  const own = phone.treeHoleFeed(day).find(p => p.content === '我发布的新内容');
  assert(own.comments.length, 'new reply persisted on user post');
  const beforeCommentCalls = calls;
  phone.commentTreeHole(day, 'old', '我来回复', 'old-comment');
  for (let i = 0; i < 30 && (calls === beforeCommentCalls || phone.moduleGenerating); i++)
    await new Promise(r => setTimeout(r, 5));
  assert(calls > beforeCommentCalls, 'comment automatically schedules reply');
  phone.deleteTreeHole(day, own.id);
  await phone.synchronize();
  assert(!phone.treeHoleFeed(day).some(p => p.id === own.id), 'deleted posts remain deleted after sync');
  const total = phone.treeHoleFeed(day).length;
  const responder = global.generateRaw;
  global.generateRaw = async args => {
    const result = await responder(args);
    chatKey = 'other';
    return result;
  };
  await assert.rejects(phone.refreshTreeHole(day, 'old'), /切换|取消/);
  assert.equal(phone.treeHoleFeed(day).length, total, 'stale response not inserted');
  chatKey = 'test';

  const { registerMomentsFollow } = require(base + '/services/space/moments-follow.ts');
  const { prepareTreeHoleActivity, anonymousActors } = require(base + '/services/space/tree-hole.ts');
  const listeners = {};
  global.tavern_events = {
    GENERATION_AFTER_COMMANDS: 'before',
    GENERATION_ENDED: 'end',
    GENERATION_STOPPED: 'stop',
    CHAT_CHANGED: 'change',
  };
  global.eventOn = (name, fn) => {
    listeners[name] = fn;
    return { stop: () => delete listeners[name] };
  };
  let injected = '',
    savedPlan;
  global.injectPrompts = prompts => {
    injected = prompts[0].content;
    return { uninject: () => {} };
  };
  Object.assign(phone.state.moments.settings, {
    followEnabled: true,
    postProbability: 100,
    cooldownMinutes: 10,
    minDelaySeconds: 2,
    maxDelaySeconds: 2,
  });
  phone.settings.moduleSettings.zone.maxNew = 4;
  const activity = prepareTreeHoleActivity(phone.state.treeHole[day], phone.state.moments.settings);
  activity.lastRequestAt = 0;
  const dispose = registerMomentsFollow(
    () => ({
      state: activity,
      identities: anonymousActors(phone.identities),
      posts: momentTimeline(activity).posts,
      topic: '匿名话题',
      settings: phone.settings,
      cardName: 'Alice',
      busy: false,
    }),
    plan => {
      savedPlan = plan;
      activity.requests[plan.id] = plan;
      activity.lastRequestAt = plan.createdAt;
    },
    true,
  );
  listeners.before('normal', {}, true);
  assert.equal(injected, '');
  listeners.before('normal', {}, false);
  assert(injected.includes('<wave_tree_hole>'));
  assert.deepEqual(savedPlan.imageCounts, [0]);
  assert.equal(savedPlan.minDelay, 2);
  const originalPlan = savedPlan;
  listeners.before('normal', {}, false);
  assert.equal(savedPlan, originalPlan, 'cooldown inherited');
  const b = {
    request_id: savedPlan.id,
    posts: [{ authorKey: savedPlan.postActor, authorName: '匿名', content: '跟随动态', images: [], delaySeconds: 2 }],
    comments: [],
    likes: [],
  };
  syncMomentEvents(activity, ['<wave_moments>' + JSON.stringify(b) + '</wave_moments>'], 1000);
  assert(!phone.treeHoleFeed(day, 2999).some(p => p.content === '跟随动态'));
  assert(phone.treeHoleFeed(day, 3000).some(p => p.content === '跟随动态'));
  syncMomentEvents(activity, ['<wave_moments>' + JSON.stringify(b) + '</wave_moments>'], 5000);
  assert.equal(momentTimeline(activity).posts.filter(p => p.content === '跟随动态').length, 1);
  dispose();
  // Existing character-space comments are not stored in moments.comments: targeting must still work.
  phone.state.snapshots[key].zone = JSON.stringify({
    posts: [
      {
        id: 'legacy',
        content: '角色帖子',
        comments: [{ id: 'c1', authorKey: 'guest', author: '访客', content: '旧评论' }],
      },
    ],
  });
  phone.state.moments.settings.postingCharKeys = [key];
  const legacyPost = phone.momentsFeed.posts.find(p => p.id.endsWith(':legacy'));
  const legacyComment = phone.momentsFeed.comments.find(c => c.postId === legacyPost.id);
  require(base + '/services/generation/generation.ts').generateMomentsBatch = async (_input, plan, state) => {
    assert(plan.comments.every(c => c.replyToCommentId === legacyComment.id));
    assert(momentTimeline(state).comments.some(c => c.id === legacyComment.id));
    return {
      request_id: plan.id,
      npcs: [],
      posts: [],
      likes: [],
      comments: plan.comments.map(c => ({
        authorKey: c.actorKey,
        authorName: 'Alice',
        postId: c.postId,
        replyToCommentId: c.replyToCommentId,
        content: '精准回复',
        delaySeconds: 0,
      })),
    };
  };
  await phone.generateMomentInteractions(legacyPost.id, legacyComment.id);
  assert(phone.momentsFeed.comments.some(c => c.content === '精准回复' && c.parentId === legacyComment.id));
  app.unmount();
  console.log(
    'PASS anonymous migration, slider counts, no images, privacy, comment targeting, all action rows, automatic post/comment replies, deletion and chat-switch protection',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
