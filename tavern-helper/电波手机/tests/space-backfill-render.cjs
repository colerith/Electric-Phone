const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="wave-phone-script-root"><div class="wave-device"><div id="app"></div></div></div>', {
  url: 'http://localhost',
});
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
const ApiSettings = require(base + '/components/space/WaveMoments.vue').default;
const { useSystemClockStore } = require(base + '/stores/system-clock.ts');
let phone, clock;
const originalNow = Date.now;
let clockTick = originalNow();
Date.now = () => ++clockTick;
const appId = vue.ref('memo');
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    clock = useSystemClockStore();
    return () => vue.h(ApiSettings, { view: 'feed', userName: 'User', userAvatar: '', context: 'space' });
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
  const key = phone.activeIdentity.charKey;
  const { AppSnapshotSchema } = require(base + '/schemas.ts');
  const posts = Array.from({ length: 300 }, (_, i) => ({
    id: `post-${i}`,
    title: `动态 ${i}`,
    content: '历史补生成',
    date: '2020/1/1 09:00',
    comments: [{ id: `comment-${i}`, author: 'Alice', content: '评论' }],
  }));
  phone.state.snapshots[key] = AppSnapshotSchema.parse({ zone: JSON.stringify({ posts }) });
  await tick();
  assert.equal(document.querySelectorAll('article.moment-post').length, 20);
  const load = [...document.querySelectorAll('button')].find(b => b.textContent.includes('加载更多动态'));
  assert(load);
  load.click();
  await tick();
  assert.equal(document.querySelectorAll('article.moment-post').length, 40);
  assert(document.body.textContent.includes('历史补生成'));
  const { messageClockTime } = require(base + '/services/core/message-clock.ts');
  let invalidations = 0;
  const stop = vue.watch(
    () => clock.civilDate,
    () => {
      invalidations++;
    },
    { flush: 'sync' },
  );
  for (let i = 0; i < 100; i++) messageClockTime(phone.settings.basic.systemClock);
  assert.equal(invalidations, 0, 'reading display time must not mutate the live clock');
  stop();
  Date.now = originalNow;
  app.unmount();
  console.log('PASS space renders 300 backfilled posts in bounded batches without reactive loops');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
