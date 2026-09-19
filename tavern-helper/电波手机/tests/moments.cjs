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
let vars = { script: {}, global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => 'test', characterId: '1' },
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
  Moments = require(base + '/components/space/WaveMoments.vue').default,
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
(async () => {
  await phone.synchronize();
  await tick();
  assert.equal(contactLetter('张三'), 'Z');
  assert.equal(contactLetter('陈辰'), 'C');
  assert.equal(contactLetter('李明'), 'L');
  assert.equal(contactLetter('王五'), 'W');
  assert.equal(contactLetter('Éva'), 'E');
  assert.equal(contactLetter('123'), '#');
  component.openComposer();
  await tick();
  assert(surface.value.contains(document.querySelector('.moment-composer')));
  input(document.querySelector('.moment-composer textarea'), '今天的照片');
  clickText('.moment-composer button', '文字描述');
  await tick();
  input(document.querySelector('.moments-media-modal textarea'), '窗边的一束花');
  clickText('.moments-media-modal button', '添加图片');
  await tick();
  clickText('.moment-composer button', '文字描述');
  await tick();
  input(document.querySelector('.moments-media-modal textarea'), '雨后的街道');
  clickText('.moments-media-modal button', '添加图片');
  await tick();
  clickText('.moment-composer button', '发表');
  await tick();
  assert.equal(phone.state.moments.posts.length, 1);
  assert.equal(phone.state.moments.posts[0].images.length, 2);
  assert(document.querySelector('.moment-post').textContent.includes('今天的照片'));
  assert(!document.querySelector('.moment-composer'));
  const key = phone.identities[0].charKey;
  phone.publishMoment({
    content: 'PRIVATE-ONLY-9273',
    images: [],
    location: '',
    mentions: [key],
    visibility: 'self',
    audience: [],
  });
  assert.deepEqual(phone.state.moments.posts[0].mentions, []);
  assert(!canSeeMoment(phone.state.moments.posts[0], key));
  await phone.synchronize();
  assert.equal(phone.state.moments.posts.length, 2);
  view.value = 'me';
  await tick();
  component.openProfile();
  await tick();
  input(document.querySelector('.moments-form input'), 'Sarah');
  clickText('.moments-form button', '保存资料');
  await tick();
  assert.equal(phone.state.moments.profile.nickname, 'Sarah');
  assert.equal(vars.global.wave_phone_user_profiles.identifier, 'cn.wave-phone.tavern-helper');
  assert.equal(vars.global.wave_phone_user_profiles.data.User.nickname, 'Sarah');
  phone.state.moments.profile.cover = 'https://example.com/user-cover.jpg';
  phone.saveMoments();
  phone.selectUserScope('Another User');
  assert.equal(phone.state.moments.profile.nickname, '');
  assert.equal(phone.state.moments.profile.cover, '');
  phone.selectUserScope('User');
  assert.equal(phone.state.moments.profile.nickname, 'Sarah');
  assert.equal(phone.state.moments.profile.cover, 'https://example.com/user-cover.jpg');
  await tick();
  assert.equal(document.querySelectorAll('.moment-post').length, 2);
  const state = MomentsStateSchema.parse({});
  Object.assign(state.settings, {
    followEnabled: true,
    postingCharKeys: [key],
    postProbability: 100,
    commentProbability: 100,
    cooldownMinutes: 0,
  });
  state.posts = phone.state.moments.posts;
  const now = Date.now() + 1000,
    plan = planMoments(state, phone.identities, state.posts, now, () => 0);
  assert(plan);
  assert.equal(plan.comments.length, 1);
  assert.notEqual(plan.comments[0].postId, state.posts[0].id);
  const prompt = buildMomentsPrompt(plan, state, state.posts);
  assert(!prompt.includes('PRIVATE-ONLY-9273'));
  assert(prompt.includes('今天的照片'));
  state.requests[plan.id] = plan;
  const batch = {
    request_id: plan.id,
    posts: [{ authorKey: key, content: '下班散步', delaySeconds: 20 }],
    comments: [{ authorKey: key, postId: plan.comments[0].postId, content: '很好看', delaySeconds: 30 }],
  };
  const raw = '<wave_moments>' + JSON.stringify(batch) + '</wave_moments>';
  syncMomentEvents(state, [raw], now);
  assert.equal(state.events.length, 1);
  let timeline = momentTimeline(state);
  assert.equal(timeline.posts.length, 3);
  assert.equal(timeline.comments.length, 1);
  assert.equal(timeline.comments[0].availableAt, now + 30000);
  syncMomentEvents(state, [raw], now + 10000);
  assert.equal(momentTimeline(state).posts.length, 3);
  assert.equal(state.events[0].receivedAt, now);
  state.events[0].independent = true;
  syncMomentEvents(state, [], now);
  assert.equal(state.events.length, 1);
  state.events[0].independent = false;
  syncMomentEvents(state, [], now);
  assert.equal(momentTimeline(state).posts.length, 2);
  batch.comments[0].postId = state.posts[0].id;
  syncMomentEvents(state, ['<wave_moments>' + JSON.stringify(batch) + '</wave_moments>'], now);
  assert.equal(state.events.length, 0);

  const forced = MomentsStateSchema.parse({ settings: { postingCharKeys: [key] } });
  const forcedPlan = planMoments(forced, phone.identities, state.posts, now, () => 0, { force: true });
  assert(forcedPlan);
  assert.equal(forcedPlan.postActor, key);

  const replyState = MomentsStateSchema.parse({ settings: { postingCharKeys: [key] } });
  replyState.posts = [
    MomentPostSchema.parse({
      id: 'reply-post',
      authorKey: key,
      authorName: 'Alice',
      content: '回复链测试',
      createdAt: now,
      availableAt: now,
    }),
  ];
  replyState.comments.push(
    MomentCommentSchema.parse({
      id: 'user-comment',
      postId: 'reply-post',
      authorKey: 'user',
      authorName: 'User',
      content: '请回复这条',
      createdAt: now,
      availableAt: now,
    }),
  );
  const replyPlan = planMomentReply(replyState, phone.identities, replyState.posts, 'reply-post', 'user-comment', now);
  assert(replyPlan);
  assert.equal(replyPlan.comments[0].replyToCommentId, 'user-comment');
  replyState.requests[replyPlan.id] = replyPlan;
  syncMomentEvents(
    replyState,
    [
      '<wave_moments>' +
        JSON.stringify({
          request_id: replyPlan.id,
          comments: [
            {
              authorKey: key,
              postId: 'reply-post',
              replyToCommentId: 'user-comment',
              content: '这是后续回复',
            },
          ],
        }) +
        '</wave_moments>',
    ],
    now,
  );
  const reply = momentTimeline(replyState).comments.find(comment => comment.content === '这是后续回复');
  assert.equal(reply.parentId, 'user-comment');
  assert.equal(reply.replyToAuthorName, 'User');

  const fresh = MomentsStateSchema.parse({
    profile: { nickname: 'User' },
    settings: {
      followEnabled: true,
      npcEnabled: true,
      postProbability: 100,
      likeProbability: 100,
      commentProbability: 100,
      minInteractions: 3,
      maxInteractions: 3,
      cooldownMinutes: 0,
    },
  });
  fresh.posts = state.posts;
  const npcPlan = planMoments(fresh, phone.identities, fresh.posts, now, () => 0);
  assert.equal(npcPlan.interactionLimit, 3);
  assert(npcPlan.likes.length > 0);
  assert(npcPlan.comments.length + npcPlan.likes.length <= 3);
  assert(npcPlan.postActor.startsWith('npc:'));
  const structuredPrompt = buildMomentsPrompt(npcPlan, fresh, fresh.posts);
  assert(structuredPrompt.includes('"role":"user"'));
  assert(structuredPrompt.includes('"role":"npc"'));
  assert(structuredPrompt.includes('"action":"like"'));
  fresh.requests[npcPlan.id] = npcPlan;
  const interaction = {
    npcs: [
      {
        npcId: npcPlan.postActor,
        username: '路人小林',
        profile: '附近咖啡店的常客',
        avatarSeed: npcPlan.actors.find(a => a.key === npcPlan.postActor).avatarSeed,
      },
    ],
    request_id: npcPlan.id,
    posts: [],
    comments: npcPlan.comments.map(target => ({
      authorKey: target.actorKey,
      authorName: '路人小林',
      postId: target.postId,
      content: '赞同',
      delaySeconds: 20,
    })),
    likes: npcPlan.likes.map(target => ({
      authorKey: target.actorKey,
      authorName: '路人小林',
      postId: target.postId,
      delaySeconds: 25,
    })),
  };
  let text = '<wave_moments>' + JSON.stringify(interaction) + '</wave_moments>';
  syncMomentEvents(fresh, [text], now);
  assert.equal(fresh.events.length, 1);
  assert(momentTimeline(fresh).likes.length > 0);
  assert.equal(momentTimeline(fresh).likes[0].availableAt, now + 25000);
  syncMomentEvents(fresh, [text, text], now);
  assert.equal(fresh.events.length, 1);
  assert.equal(momentTimeline(fresh).likes.length, npcPlan.likes.length);
  interaction.likes[0].authorName = 'User';
  syncMomentEvents(fresh, ['<wave_moments>' + JSON.stringify(interaction) + '</wave_moments>'], now);
  assert.equal(fresh.events.length, 0);
  interaction.likes[0].authorName = '路人小林';
  interaction.likes.push(interaction.likes[0]);
  syncMomentEvents(fresh, ['<wave_moments>' + JSON.stringify(interaction) + '</wave_moments>'], now);
  assert.equal(fresh.events.length, 0);
  app.unmount();
  console.log(
    'PASS: alphabetical grouping; actual Vue multi-image-description publishing, persistence/profile/own feed; privacy-safe planning/prompt, delayed replay, deduplication, deletion and unauthorized-comment rejection.',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
