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
global._ = require('lodash');
global.z = require('zod').z;
global.window = global;
global.toastr = { info: () => {} };
let chat = 'test-chat',
  vars = { script: {}, chat: {} },
  floors = [];
global.SillyTavern = { name1: 'User', getCurrentChatId: () => chat, characterId: '1', groupId: '', characters: [] };
global.getCharData = () => ({ name: 'Alice', avatar: 'a.png' });
global.getCharAvatarPath = () => '/a.png';
global.getVariables = ({ type }) => vars[type];
global.replaceVariables = (v, { type }) => {
  vars[type] = v;
};
global.getChatMessages = range => (typeof range === 'number' ? floors.filter(m => m.message_id === range) : floors);
global.stopGenerationById = async () => true;
let rules = [];
global.getTavernRegexes = () => rules;
global.updateTavernRegexesWith = async fn => (rules = fn(rules));
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { createPinia, setActivePinia } = require('pinia');
setActivePinia(createPinia());
const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const store = usePhoneStore();
store.settings.basic.cacheEnabled = false;

const { ImageProfileSchema } = require(base + '/services/image/schema.ts');
const { MomentPostSchema, MomentsStateSchema, planMoments, syncMomentEvents } = require(
  base + '/services/space/moments.ts',
);
const { selectedImage, imageTargetKey } = require(base + '/services/image/library.ts');
const { buildMomentsPrompt } = require(base + '/prompts/index.ts');
const { ZonePostSchema } = require(base + '/services/space/zone.ts');
const { baibaiCharacters } = require(base + '/services/image/baibai.ts');
const { nextTick } = require('vue');
(async () => {
  await store.synchronize();
  store.settings.imageServices.profiles = [
    ImageProfileSchema.parse({ id: 'gpt', provider: 'openai', apiKey: 'fake', model: 'gpt-image-1' }),
  ];
  const thread = store.activeThread;
  const indexBeforeDraft = store.messageThreadIndex;
  const originalReplace = global.replaceVariables;
  let chatWrites = 0,
    unrelatedWrites = 0;
  global.replaceVariables = (value, options) => {
    if (options.type === 'chat') chatWrites++;
    else unrelatedWrites++;
    return originalReplace(value, options);
  };
  store.setDraft('性能回归草稿');
  store.setDraft('性能回归草稿');
  assert.equal(chatWrites, 1, 'changed draft is saved immediately; identical input does not write again');
  assert.equal(unrelatedWrites, 0, 'typing must not rewrite global wallet or roster stores');
  assert.equal(store.messageThreadIndex, indexBeforeDraft, 'typing must not rebuild message index');
  global.replaceVariables = originalReplace;

  thread.messages.push({
    id: 'photo',
    sender: 'char',
    type: 'image',
    content: '雨后的街道',
    createdAt: new Date().toISOString(),
    payload: { url: 'data:image/png;base64,AQID', imageRequest: { subject: 'scene', prompt: 'empty rainy street' } },
  });
  const target = { kind: 'message', threadId: thread.id, messageId: 'photo', index: 0 };
  let draft = store.getImageAsset(target);
  assert.equal(draft.versions.length, 1);
  draft.profileId = 'gpt';
  let payload;
  global.fetch = async (url, init) => {
    payload = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: [{ b64_json: 'BAUG' }] }));
  };
  await store.runImageAction(target, draft, 'generate', new AbortController().signal);
  let asset = store.getImageAsset(target);
  assert.equal(asset.versions.length, 2);
  assert.equal(selectedImage(asset).url, 'data:image/png;base64,BAUG');
  assert.match(payload.prompt, /no (people|humans)|不含人物|without people/i);
  require(base + '/services/generation/generation.ts').generateImageCaption = async () => '雨停了，街道还映着灯光。';
  await store.runImageAction(target, asset, 'caption', new AbortController().signal);
  assert.equal(store.getImageAsset(target).description, '雨停了，街道还映着灯光。');
  assert.equal(selectedImage(store.getImageAsset(target)).description, '雨停了，街道还映着灯光。');
  global.fetch = async () => new Response('failed', { status: 400 });
  await assert.rejects(
    store.runImageAction(target, store.getImageAsset(target), 'generate', new AbortController().signal),
  );
  assert.equal(store.getImageAsset(target).versions.length, 2);
  assert.equal(store.getImageAsset(target).status, 'failed');
  const before = structuredClone(JSON.parse(JSON.stringify(store.getImageAsset(target))));
  let resolve;
  global.fetch = () => new Promise(r => (resolve = r));
  const cancel = new AbortController();
  const pending = store.runImageAction(target, before, 'generate', cancel.signal);
  await assert.rejects(store.runImageAction(target, before, 'generate', new AbortController().signal), /正在生成/);
  cancel.abort();
  resolve(new Response(JSON.stringify({ data: [{ b64_json: 'BwgJ' }] })));
  await pending;
  assert.equal(store.getImageAsset(target).versions.length, 2);
  const deleting = store.runImageAction(target, store.getImageAsset(target), 'generate', new AbortController().signal);
  thread.messages = [];
  resolve(new Response(JSON.stringify({ data: [{ b64_json: 'BwgJ' }] })));
  await deleting;
  assert.equal(store.getImageAsset(target), undefined);
  // Space gallery edits survive feed recomputation and schema serialization.
  store.state.moments.posts = [
    MomentPostSchema.parse({
      createdAt: 0,
      availableAt: 0,
      id: 'post',
      authorKey: 'user',
      authorName: 'User',
      content: '午后',
      images: [{ kind: 'description', description: '一杯茶', imageRequest: { subject: 'object', prompt: 'tea cup' } }],
    }),
  ];
  const mt = { kind: 'moment', postId: 'post', index: 0 };
  let ma = store.getImageAsset(mt);
  ma.profileId = 'gpt';
  global.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] }));
  await store.runImageAction(mt, ma, 'generate', new AbortController().signal);
  assert.equal(store.momentsFeed.posts[0].images[0].kind, 'image');
  assert.equal(store.state.moments.posts[0].images[0].kind, 'description', 'computed must not mutate original');
  const saved = MomentsStateSchema.parse(JSON.parse(JSON.stringify(store.state.moments)));
  assert.equal(saved.imageEdits[imageTargetKey(mt)].versions.length, 1);
  ma = store.getImageAsset(mt);
  ma.versions = [];
  ma.selected = '';
  store.updateImageAsset(mt, ma);
  assert.equal(store.momentsFeed.posts[0].images[0].url, '');
  // Targeted interaction respects selected actors and private audiences; never emits User.
  const state = MomentsStateSchema.parse({
    settings: {
      postingCharKeys: [store.activeIdentity.charKey],
      maxInteractions: 3,
      minInteractions: 1,
      imageMode: 'ai',
      maxImages: 2,
    },
  });
  const post = MomentPostSchema.parse({
    createdAt: 0,
    availableAt: 0,
    id: 'u',
    authorKey: 'user',
    authorName: 'User',
    content: 'hello',
    visibility: 'include',
    audience: [store.activeIdentity.charKey],
  });
  const plan = planMoments(state, store.identities, [post], Date.now(), () => 0, { force: true, targetPostId: 'u' });
  assert(plan);
  assert.equal(plan.postActor, null);
  assert(plan.comments.length);
  assert(plan.comments.every(c => c.postId === 'u' && c.actorKey !== 'user'));
  assert.equal(
    planMoments(state, store.identities, [{ ...post, visibility: 'self' }], Date.now(), () => 0, {
      force: true,
      targetPostId: 'u',
    }),
    null,
  );
  const prompt = buildMomentsPrompt(plan, state, [post], undefined, undefined, 'novelai');
  assert.match(prompt, /NovelAI/);
  assert.match(prompt, /最多 2/);
  assert.match(prompt, /"subject"/);
  assert.equal(
    ZonePostSchema.parse({
      id: 'z',
      content: 'scene',
      images: [{ subject: 'scene', prompt: 'no humans, scenery', description: '山间薄雾' }],
    }).images[0].subject,
    'scene',
  );
  // Automatic publishing invokes the secondary interaction path exactly once.
  store.state.moments.settings.postingCharKeys = [store.activeIdentity.charKey];
  store.state.moments.settings.autoUserInteractions = true;
  store.state.moments.settings.minInteractions = 1;
  store.state.moments.settings.maxInteractions = 1;
  let interactions = 0;
  require(base + '/services/generation/generation.ts').generateMomentsBatch = async (_input, plan) => {
    interactions++;
    return {
      request_id: plan.id,
      posts: [],
      npcs: [],
      likes: plan.likes.map(t => ({ authorKey: t.actorKey, authorName: 'Alice', postId: t.postId, delaySeconds: 0 })),
      comments: plan.comments.map(t => ({
        authorKey: t.actorKey,
        authorName: 'Alice',
        postId: t.postId,
        content: '看起来很不错！',
        delaySeconds: 0,
      })),
    };
  };
  store.publishMoment({
    content: '新发布的日常',
    images: [],
    location: '',
    mentions: [],
    visibility: 'all',
    audience: [],
  });
  await nextTick();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(interactions, 1);
  const newId = store.state.moments.posts[0].id;
  assert(
    store.momentsFeed.comments.some(c => c.postId === newId) || store.momentsFeed.likes.some(c => c.postId === newId),
  );
  await nextTick();
  assert.equal(interactions, 1);
  // New structured space pictures auto-generate once, preserving a portrait-free subject.
  store.state.moments.settings.imageProfileId = 'gpt';
  store.state.moments.settings.maxImages = 1;
  let imageCalls = 0;
  global.fetch = async () => {
    imageCalls++;
    return new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] }));
  };
  store.state.moments.settings.imageMode = 'ai';
  store.publishMoment({
    content: '茶杯',
    images: [{ kind: 'description', url: '', description: '一只茶杯' }],
    location: '',
    mentions: [],
    visibility: 'self',
    audience: [],
  });
  await nextTick();
  await new Promise(r => setTimeout(r, 40));
  assert.equal(imageCalls, 1);
  await nextTick();
  assert.equal(imageCalls, 1);
  // Explicit user generation works even when automatic space images are disabled.
  const { manualImageMedia } = require(base + '/services/image/manual.ts');
  assert.throws(() => manualImageMedia({ description: ' ', count: 1, profileId: 'gpt' }));
  assert.throws(() => manualImageMedia({ description: '海边', count: 10, profileId: 'gpt' }));
  store.state.moments.settings.imageMode = 'description';
  const manual = manualImageMedia({ description: '海边散步', count: 9, profileId: 'gpt', kind: 'video' });
  assert.equal(manual.length, 9);
  assert.match(manual[8].imageRequest.prompt, /9\/9/);
  store.publishMoment({
    content: '分镜',
    images: manual,
    location: '',
    mentions: [],
    visibility: 'self',
    audience: [],
  });
  await nextTick();
  await new Promise(r => setTimeout(r, 120));
  assert.equal(imageCalls, 10);
  const manualPost = store.state.moments.posts[0];
  assert.equal(store.getImageAsset({ kind: 'moment', postId: manualPost.id, index: 8 }).status, 'complete');
  let cleared = false;
  const commentTask = store.commentMoment(manualPost.id, '立即清空', undefined, () => {
    cleared = true;
  });
  assert.equal(cleared, true);
  assert(store.state.moments.comments.some(c => c.content === '立即清空'));
  await commentTask;
  await store.sendMessage({
    type: 'video',
    content: '海边散步',
    payload: { images: manual.slice(0, 2), manualImageGeneration: true, imageProfileId: 'gpt' },
  });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(imageCalls, 12);
  const sentMedia = store.activeThread.messages.findLast(m => m.payload.manualImageGeneration);
  assert.equal(
    store.getImageAsset({ kind: 'message', threadId: store.activeThread.id, messageId: sentMedia.id, index: 1 }).status,
    'complete',
  );
  global.window = { parent: {} };
  SillyTavern.extensionSettings = {
    baibai_image_char_global: {
      entries: [{ name: 'User', fields: { sex: '1girl', hair: 'black hair' }, nl: 'A girl with black hair' }],
    },
  };
  SillyTavern.chatMetadata = { baibai_image_char_tags: { entries: [{ name: 'Alice', fields: { hair: 'red hair' } }] } };
  const chars = baibaiCharacters();
  assert.equal(chars.length, 2);
  assert.equal(chars[0].tag, '1girl, black hair');
  assert.equal(chars[1].scope, 'chat');
  await nextTick();
  console.log(
    'PASS gallery generation/version persistence/caption/failure/cancel/deletion, space overlays/privacy/prompts and BaiBai field fallback',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
