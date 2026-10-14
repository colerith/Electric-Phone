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
require.extensions['.vue'] = (m, f) =>
  m._compile(
    compile(compileScript(parse(fs.readFileSync(f, 'utf8')).descriptor, { id: f, inlineTemplate: true }).content),
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
let chat = 'test',
  floors = [],
  vars = { script: {}, global: {}, chat: {} };
global.SillyTavern = {
  name1: 'User',
  characterId: '1',
  groupId: '',
  characters: [],
  getCurrentChatId: () => chat,
  getContext: () => ({ substituteParams: x => x }),
};
Object.assign(global, {
  getCharData: () => ({ name: 'Alice', avatar: 'a.png' }),
  getCharAvatarPath: () => '/a.png',
  getVariables: ({ type }) => vars[type],
  replaceVariables: (value, { type }) => (vars[type] = value),
  getChatMessages: id => (typeof id === 'number' ? floors.filter(f => f.message_id === id) : floors),
  getTavernRegexes: () => [],
  updateTavernRegexesWith: async fn => fn([]),
  stopGenerationById: async () => true,
  toastr: { info: () => {} },
});
window.SillyTavern = global.SillyTavern;
const handlers = new Map();
global.tavern_events = new Proxy({}, { get: (_, name) => name });
global.eventOn = (event, fn) => {
  const list = handlers.get(event) || new Set();
  list.add(fn);
  handlers.set(event, list);
  return { stop: () => list.delete(fn) };
};
const emit = (name, ...args) => {
  for (const fn of [...(handlers.get(name) || [])]) fn(...args);
};
const injections = [];
global.injectPrompts = rows => {
  injections.push(...rows);
  return { uninject: () => {} };
};
global.setChatMessages = async rows => {
  for (const row of rows) {
    Object.assign(
      floors.find(f => f.message_id === row.message_id),
      row,
    );
    emit('CHARACTER_MESSAGE_RENDERED', row.message_id);
  }
};
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const vue = require('vue'),
  { createPinia } = require('pinia');
const { APP_IDS, ScriptSettingsSchema } = require(base + '/schemas.ts');
const { appApiMode, appApiSettings } = require(base + '/services/generation/app-api.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const ApiSettings = require(base + '/components/settings/WaveAppApiSettings.vue').default;
let phone;
const appId = vue.ref('memo');
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    return () => vue.h(ApiSettings, { app: appId.value });
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async fn => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await wait(5);
  }
  throw Error('timed out');
};
(async () => {
  await phone.synchronize();
  phone.settings.basic.cacheEnabled = false;
  phone.settings.api = {
    ...phone.settings.api,
    enabled: true,
    apiurl: 'https://global.invalid/v1',
    key: 'global-secret',
    model: 'global-model',
    retryCount: 0,
  };
  phone.settings.apiProfiles = [
    {
      id: 'memo-api',
      name: '备忘专用',
      api: { ...phone.settings.api, apiurl: 'https://memo.invalid/v1', key: 'memo-secret', model: 'memo-model' },
    },
  ];
  for (const id of APP_IDS) {
    appId.value = id;
    await tick();
    assert(document.querySelector('.settings-card.system-settings-card'));
    assert(document.querySelector('[aria-label="此应用的 API"]'));
  }
  appId.value = 'memo';
  await tick();
  document.querySelector('[aria-label="此应用的 API"]').click();
  await tick();
  [...document.querySelectorAll('[role="option"]')].find(e => e.textContent.includes('单独设置')).click();
  await tick();
  document.querySelector('[aria-label="此应用的副 API 预设"]').click();
  await tick();
  [...document.querySelectorAll('[role="option"]')].find(e => e.textContent.includes('备忘专用')).click();
  await tick();
  assert.equal(phone.settings.generation.appApis.memo.profileId, 'memo-api');
  assert.equal(appApiSettings(phone.settings, 'memo').api.model, 'memo-model');
  assert.equal(phone.settings.api.model, 'global-model', '选择应用预设不能更换全局 API');
  assert(!document.body.textContent.includes('memo-secret'));
  assert.equal(
    ScriptSettingsSchema.parse(JSON.parse(JSON.stringify(phone.settings))).generation.appApis.memo.profileId,
    'memo-api',
  );
  phone.settings.sendMode = 'main_api';
  assert.equal(appApiMode(phone.settings, 'status'), 'main_api');
  assert.equal(appApiMode(phone.settings, 'memo'), 'secondary_api');
  phone.settings.generation.appApis.calendar = { mode: 'secondary_api', profileId: '' };
  phone.settings.generation.followEnabled = true;
  phone.settings.generation.requiredModules = ['status', 'memo', 'calendar'];
  phone.settings.generation.modules = [];
  phone.settings.generation.probability = 0;
  phone.saveSettings();
  await phone.initialize();
  const requests = [];
  const response = (updates = {}) =>
    JSON.stringify({
      version: 1,
      char_id: phone.activeIdentity.stableId,
      char_name: 'Alice',
      messages: [],
      app_updates: updates,
    });
  global.generateRaw = async args => {
    requests.push(args);
    assert(args.user_input.includes('最终正文'), '副 API 必须读到最终正文');
    const model = args.custom_api?.model;
    if (model === 'memo-model')
      return response({ memo: { notes: [{ id: 'follow-note', title: '回家', content: '正文后的备忘' }] } });
    if (model === 'global-model')
      return response({
        calendar: { events: [{ id: 'follow-event', date: '2026-10-15', time: '12:00', content: '正文后的日程' }] },
      });
    throw Error('unexpected model');
  };
  emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
  assert(injections.some(p => p.content.includes('本轮仅允许更新：status')));
  assert(!injections.some(p => p.content.includes('本轮仅允许更新：memo')));
  assert.equal(requests.length, 0);
  floors = [{ message_id: 0, role: 'assistant', message: '最终正文' }];
  emit('GENERATION_ENDED', 0);
  await wait(5);
  assert.equal(requests.length, 0, '结束事件早于最终渲染时不提前请求');
  emit('CHARACTER_MESSAGE_RENDERED', 0);
  await waitFor(() => phone.followGenerationStatus === '本轮副 API 更新完成');
  assert.equal(requests.length, 2, '按所选副 API 分组，各组只请求一次');
  assert(phone.activeSnapshot.memo.includes('正文后的备忘'));
  assert(phone.activeSnapshot.calendar.includes('正文后的日程'));
  assert(floors[0].message.startsWith('最终正文'));
  emit('CHARACTER_MESSAGE_RENDERED', 0);
  await wait(10);
  assert.equal(requests.length, 2, '写回和重渲染不能重复触发');
  await phone.synchronize();
  assert(phone.activeSnapshot.memo.includes('正文后的备忘'));
  // Manual actions obey the same selected endpoint, including primary API without secondary enabled.
  phone.settings.generation.appApis.memo = { mode: 'main_api', profileId: '' };
  phone.settings.api.enabled = false;
  global.generateRaw = async args => {
    assert.equal(args.custom_api, undefined);
    return response({ memo: '主 API 手动备忘' });
  };
  await phone.generateModule('memo');
  assert(phone.activeSnapshot.memo.includes('主 API 手动备忘'));
  phone.settings.generation.appApis.memo = { mode: 'profile', profileId: 'deleted' };
  await assert.rejects(phone.generateModule('memo'), /已删除|未选择/);
  phone.settings.generation.appApis.memo = { mode: 'profile', profileId: 'memo-api' };
  // A delayed reply must never overwrite an edited target floor.
  let finish;
  global.generateRaw = args =>
    new Promise(resolve => {
      finish = () => resolve(response({ memo: '不应写入' }));
    });
  phone.settings.generation.requiredModules = ['memo'];
  emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
  floors.push({ message_id: 1, role: 'assistant', message: '第二轮最终正文' });
  emit('CHARACTER_MESSAGE_RENDERED', 1);
  await waitFor(() => Boolean(finish));
  floors[1].message = '用户已编辑的正文';
  finish();
  await waitFor(() => !phone.moduleGenerating);
  assert.equal(floors[1].message, '用户已编辑的正文');
  assert(!phone.activeSnapshot.memo.includes('不应写入'));
  // Message replies use the app-specific preset even when global mode follows the primary API.
  phone.settings.generation.appApis.messages = { mode: 'profile', profileId: 'memo-api' };
  phone.settings.chat.minReplies = 1;
  phone.settings.chat.maxReplies = 1;
  global.generateRaw = async args => {
    assert.equal(args.custom_api.model, 'memo-model');
    return JSON.stringify({
      thread_id: phone.activeThread.id,
      messages: [{ sender: 'char', type: 'text', content: '预设私聊回复', payload: {} }],
      app_updates: {},
    });
  };
  await phone.sendMessage('测试消息预设', true);
  assert(phone.activeThread.messages.some(message => message.content === '预设私聊回复'));
  // Both space feeds inherit the zone API preset, independently of global enabled status.
  await phone.synchronize();
  phone.settings.generation.appApis.zone = { mode: 'profile', profileId: 'memo-api' };
  phone.settings.generation.requiredModules = [];
  phone.settings.moduleSettings.zone.maxNew = 1;
  Object.assign(phone.state.moments.settings, {
    followEnabled: true,
    postingCharKeys: phone.identities.map(identity => identity.charKey),
    npcEnabled: false,
    strangerEnabled: false,
    postProbability: 100,
    likeProbability: 0,
    commentProbability: 0,
    minInteractions: 1,
    maxInteractions: 1,
    cooldownMinutes: 0,
    imageProbability: 0,
    maxImages: 0,
  });
  phone.state.moments.lastRequestAt = 0;
  phone.saveMomentSettings(phone.state.moments.settings);
  const kinds = [];
  global.generateRaw = async args => {
    assert.equal(args.custom_api.model, 'memo-model');
    const prompt = args.ordered_prompts
      .filter(p => typeof p === 'object')
      .map(p => p.content)
      .join('\n');
    const planMatch = prompt.match(/"request_id"\s*:\s*"([^"]+)"/);
    assert(planMatch, '请求应包含计划 ID');
    const isHole = prompt.includes('wave_tree_hole');
    kinds.push(isHole ? 'hole' : 'moments');
    // Request plans are deliberately not persisted until their results finish: recover the requested author from prompt.
    const actor = isHole
      ? require(base + '/services/space/tree-hole.ts').anonymousActorKey(phone.activeIdentity.charKey)
      : phone.activeIdentity.charKey;
    return JSON.stringify({
      request_id: planMatch[1],
      posts: [{ authorKey: actor, authorName: 'Alice', content: '独立 API 空间动态', images: [], delaySeconds: 0 }],
      comments: [],
      likes: [],
    });
  };
  emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
  floors.push({ message_id: 2, role: 'assistant', message: '第三轮最终正文' });
  emit('CHARACTER_MESSAGE_RENDERED', 2);
  await waitFor(() => !phone.moduleGenerating && kinds.length > 0);
  assert.deepEqual(kinds, ['moments', 'hole']);
  assert(floors[2].message.includes('wave_moments') && floors[2].message.includes('wave_tree_hole'));
  // Full disable prevents both primary injection and secondary follow requests.
  phone.settings.generation.followEnabled = false;
  await tick();
  const before = requests.length;
  emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
  emit('CHARACTER_MESSAGE_RENDERED', 1);
  await wait(10);
  assert.equal(requests.length, before);
  phone.dispose();
  const { registerSecondaryFollow } = require(base + '/services/generation/secondary-follow.ts');
  const lifeSettings = vue.reactive(
    ScriptSettingsSchema.parse({
      sendMode: 'secondary_api',
      generation: { followEnabled: true, requiredModules: ['memo'], modules: [] },
    }),
  );
  let scope = 'first';
  const jobs = [],
    releases = [];
  const stop = registerSecondaryFollow(
    () => ({ key: scope, settings: lifeSettings }),
    async job => {
      jobs.push(job);
      await new Promise(resolve => releases.push(resolve));
    },
  );
  emit('GENERATION_AFTER_COMMANDS', 'quiet', {}, false);
  emit('CHARACTER_MESSAGE_RENDERED', 2);
  await wait(5);
  assert.equal(jobs.length, 0);
  emit('GENERATION_AFTER_COMMANDS', 'normal', {}, true);
  emit('CHARACTER_MESSAGE_RENDERED', 2);
  await wait(5);
  assert.equal(jobs.length, 0);
  emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
  emit('CHARACTER_MESSAGE_RENDERED', 0);
  await wait(5);
  assert.equal(jobs.length, 0, '旧楼重渲染不能消费生成任务');
  floors.push({ message_id: 3, role: 'assistant', message: '最终正文四' });
  emit('CHARACTER_MESSAGE_RENDERED', 3);
  await waitFor(() => jobs.length === 1);
  emit('CHARACTER_MESSAGE_RENDERED', 3);
  await wait(5);
  assert.equal(jobs.length, 1);
  emit('GENERATION_STOPPED');
  assert(jobs[0].signal.aborted);
  emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
  floors.push({ message_id: 4, role: 'assistant', message: '最终正文五' });
  emit('CHARACTER_MESSAGE_RENDERED', 4);
  await waitFor(() => jobs.length === 2);
  scope = 'other';
  emit('CHAT_CHANGED');
  assert(jobs[1].signal.aborted);
  assert(!jobs[1].isCurrent());
  emit('GENERATION_AFTER_COMMANDS', 'swipe', {}, false);
  emit('MESSAGE_SWIPED', 4);
  emit('CHARACTER_MESSAGE_RENDERED', 4);
  await waitFor(() => jobs.length === 3);
  emit('MESSAGE_SWIPED', 4);
  assert(jobs[2].signal.aborted, '手动切候选取消正在执行的任务');
  releases.forEach(resolve => resolve());
  stop();
  app.unmount();
  console.log(
    'PASS app API settings UI, preset persistence/isolation, primary/secondary partition, post-final-render generation, grouped presets, replay dedup, manual primary routing, deleted preset rejection and stale-floor protection',
  );
})().catch(e => {
  console.error(e, phone.followGenerationStatus);
  phone.dispose();
  app.unmount();
  process.exitCode = 1;
});
