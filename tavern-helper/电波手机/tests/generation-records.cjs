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
const ApiSettings = require(base + '/components/settings/WaveGenerationRecords.vue').default;
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
  floors = [
    { message_id: 0, role: 'assistant', message: '早晨正文 <wave_time>2020/1/1 09:00</wave_time>' },
    { message_id: 1, role: 'user', message: '然后呢' },
    { message_id: 2, role: 'assistant', message: '晚上正文 <wave_time>2020/1/1 20:00</wave_time>' },
    { message_id: 3, role: 'assistant', message: '未来秘密 <wave_time>2020/1/2 12:00</wave_time>' },
  ];
  await phone.synchronize();
  phone.settings.basic.cacheEnabled = false;
  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://test.invalid/v1';
  phone.settings.api.model = 'test';
  phone.settings.api.retryCount = 0;
  const requests = [];
  global.generateRaw = async args => {
    requests.push(args);
    assert(!JSON.stringify(args).includes('未来秘密'), '未来剧情不能进入历史请求');
    const morning = args.user_input.includes('第 0 楼');
    return JSON.stringify({
      version: 1,
      char_id: phone.activeIdentity.stableId,
      char_name: 'Alice',
      messages: [{ sender: 'char', type: 'text', content: morning ? '早上好' : '晚上好' }],
      app_updates: { status: morning ? '早晨状态' : '晚间状态' },
    });
  };
  await phone.backfillGeneration([2, 0]);
  assert.equal(requests.length, 2);
  assert(requests[0].user_input.includes('第 0 楼'));
  assert(requests[1].user_input.includes('第 2 楼'));
  assert(phone.activeSnapshot.status.includes('晚间状态'));
  const msgs = phone.activeThread.messages.filter(m => m.content === '早上好' || m.content === '晚上好');
  assert.equal(msgs.length, 2);
  assert(new Date(msgs[0].payload.storyCreatedAt).getTime() < new Date(msgs[1].payload.storyCreatedAt).getTime());
  phone.refreshGenerationRecords();
  assert.equal(phone.generationRecords[0].missing.length, 0);
  await phone.backfillGeneration([0]);
  assert.equal(requests.length, 2, '重复补生成应跳过已完成模块');
  await phone.synchronize();
  phone.refreshGenerationRecords();
  assert.equal(phone.generationRecords[0].missing.length, 0, '同步不能丢失空更新模块回执');
  // Repair an older floor after a newer floor already exists.
  floors[0].message = '早晨正文补充 <wave_time>2020/1/1 09:00</wave_time>';
  await phone.backfillGeneration([0]);
  const replayed = phone.activeThread.messages.filter(m => m.payload.waveFloor);
  assert.deepEqual(
    replayed.map(m => m.payload.sourceMessageId),
    [0, 2],
  );
  assert(phone.activeSnapshot.status.includes('晚间状态'), '旧楼补生成不能覆盖较新状态');
  // Stale result must not overwrite an edited floor.
  let finish;
  global.generateRaw = () =>
    new Promise(resolve => {
      finish = () =>
        resolve(
          JSON.stringify({
            version: 1,
            char_id: phone.activeIdentity.stableId,
            char_name: 'Alice',
            messages: [],
            app_updates: {},
          }),
        );
    });
  const job = phone.backfillGeneration([3]);
  await waitFor(() => finish);
  floors[3].message = '已编辑正文 <wave_time>2020/1/2 12:00</wave_time>';
  finish();
  await assert.rejects(job, /变化/);
  assert(!floors[3].message.includes('wave_phone_delta'));
  floors.push({ message_id: 4, role: 'assistant', message: '新楼 <wave_time>2020/1/2 13:00</wave_time>' });
  global.generateRaw = async () =>
    JSON.stringify({
      version: 1,
      char_id: phone.activeIdentity.stableId,
      char_name: 'Alice',
      messages: [],
      app_updates: {},
    });
  await phone.backfillGeneration([4]);
  assert.equal(phone.generationRecords.find(r => r.floor === 4).missing.length, 0, '空结果也是已检查');
  await tick();
  assert(document.body.textContent.includes('生成记录'));
  app.unmount();
  console.log('generation records: chronological backfill, context cutoff, receipts, stale edits and UI passed');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
