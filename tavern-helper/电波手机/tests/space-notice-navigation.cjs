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
const Space = require(base + '/components/space/WaveSpace.vue').default;
let phone, space;
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    return () =>
      vue.h(Space, {
        ref: v => (space = v),
        raw: '',
        artwork: '',
        name: 'Alice',
        avatar: '',
        userName: 'User',
        userAvatar: '',
        busy: false,
        error: '',
      });
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
(async () => {
  await phone.synchronize();
  const { TreeHoleStateSchema } = require(base + '/services/space/tree-hole.ts');
  const day = '2018-11-01',
    now = Date.now() - 100000;
  phone.state.treeHole = TreeHoleStateSchema.parse({
    [day]: {
      topic: '回归',
      posts: Array.from({ length: 200 }, (_, i) => ({
        id: `p${i}`,
        alias: `匿名${i}`,
        content: `目标内容 ${i}`,
        createdAt: now + i,
        comments: Array.from({ length: 60 }, (_, j) => ({
          id: `c${i}-${j}`,
          alias: '访客',
          content: `回应 ${j}`,
          createdAt: now + j,
        })),
      })),
    },
  });
  await tick();
  space.openNotifications();
  await tick();
  assert.equal(document.querySelectorAll('.space-notice-row').length, 30);
  assert.equal(document.querySelectorAll('.moment-post').length, 0, 'hidden feed is unmounted');
  const button = [...document.querySelectorAll('.space-notice-row')].find(b => b.textContent.includes('目标内容 199'));
  assert(button);
  button.click();
  await tick();
  await tick();
  assert.equal(document.querySelectorAll('.space-hole-post').length, 1, 'notification opens only its target');
  assert.equal(document.querySelectorAll('.space-comment').length, 20);
  assert.equal(document.querySelectorAll('.moment-post').length, 0, 'tree hole never mounts the other feed');
  assert(document.querySelector('[data-hole-post="p199"]'));
  assert(space.back());
  await tick();
  assert.equal(document.querySelectorAll('.space-notice-row').length, 30);
  assert.equal(document.querySelectorAll('.space-hole-post').length, 0);
  // Repeated visits must not accumulate hidden post trees.
  document.querySelector('.space-notice-row').click();
  await tick();
  await tick();
  assert.equal(document.querySelectorAll('.space-hole-post').length, 1);
  app.unmount();
  dom.window.close();
  console.log('PASS 200 posts and 12000 comments: bounded notifications, direct detail, return and repeated visits');
  process.exit(0);
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exit(1);
});
