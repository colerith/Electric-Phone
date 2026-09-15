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
let vars = {
  script: {
    wave_phone_settings: {
      moduleSettings: { memo: { maxNew: 2 } },
      api: { enabled: true, apiurl: 'https://legacy.example/v1', key: 'legacy-key', model: 'legacy-model' },
    },
  },
  global: {
    wave_phone_settings: { identifier: 'cn.wave-phone.tavern-helper', version: 1, data: {} },
  },
  chat: {},
};
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

const { usePhoneStore } = require(base + '/stores/phone.ts');
const { ModuleSettingsSchema } = require(base + '/services/module-settings.ts');
const { mergeLimitedModule, limitModulePatch } = require(base + '/services/module-updates.ts');
const { parseMemoData } = require(base + '/services/memo.ts');
const { parseCalendar } = require(base + '/services/calendar.ts');
const { parseBrowseNotes } = require(base + '/services/browser.ts');
const { parseZonePage } = require(base + '/services/zone.ts');
const { buildModulePrompt, buildPhonePrompts } = require(base + '/prompts/index.ts');
const { serializeDelta } = require(base + '/services/module-protocol.ts');
const Settings = require(base + '/components/WaveModuleSettings.vue').default;
const Memo = require(base + '/components/WaveMemoPanel.vue').default;
let phone;
const selected = vue.ref('memo'),
  raw = vue.ref('');
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    return () => vue.h('section', [vue.h(Settings, { app: selected.value }), vue.h(Memo, { raw: raw.value })]);
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const item = id => ({
  id: String(id),
  title: '标题' + id,
  content: '原文' + id,
  translation: { language: '简体中文', title: '译名' + id, content: '译文' + id },
});
(async () => {
  // Bounds, upgrades, per-array counts, and updates at zero.
  assert.equal(Object.hasOwn(vars.script, 'wave_phone_settings'), false);
  assert.equal(vars.global.wave_phone_settings.data.moduleSettings.memo.maxNew, 2);
  assert.equal(vars.global.wave_phone_settings.data.api.key, 'legacy-key');
  assert.equal(vars.global.wave_phone_settings__legacy_backup.data.api.model, 'legacy-model');
  assert.equal(vars.global.wave_phone_settings__recovery_v2.data, true);
  assert(!ModuleSettingsSchema.safeParse({ memo: { maxNew: 6 } }).success);
  let config = ModuleSettingsSchema.parse({
    memo: { maxNew: 1, maxDoodles: 2, autoTranslate: true },
    zone: { maxNew: 1 },
    calendar: { maxNew: 0 },
    browse: { maxNew: 2 },
  });
  const old = '【旧便签】\n保留原文\n随性涂鸦：\n  /\\\n (o)\n涂鸦解析：旧解析';
  const legacy = parseMemoData(old);
  assert.equal(legacy.notes.length, 1);
  assert(legacy.doodles[0].content.includes('  /'));
  let merged = mergeLimitedModule(
    'memo',
    old,
    { notes: [item('n1'), item('n2')], doodles: [item('d1'), item('d2'), item('d3')] },
    config,
  );
  assert.equal(parseMemoData(merged).notes.length, 2);
  assert.equal(parseMemoData(merged).doodles.length, 3);
  const budget = {};
  let current = mergeLimitedModule('memo', '', { notes: [item('a'), item('a'), item('b')] }, config, budget);
  current = mergeLimitedModule(
    'memo',
    current,
    { notes: [{ ...item('a'), content: '编辑' }, item('c')] },
    config,
    budget,
  );
  assert.equal(parseMemoData(current).notes.length, 1);
  assert.equal(parseMemoData(current).notes[0].content, '编辑');
  config.memo.maxNew = 0;
  merged = mergeLimitedModule(
    'memo',
    merged,
    { notes: [{ ...item('n1'), content: '零额度仍可编辑' }, item('x')] },
    config,
  );
  assert.equal(parseMemoData(merged).notes.length, 2);
  assert.equal(parseMemoData(merged).notes[1].content, '零额度仍可编辑');
  assert.equal(
    parseCalendar(
      mergeLimitedModule('calendar', '2026-09-14 12:00：旧日程', { events: [{ id: 'new', content: '新增' }] }, config),
    ).length,
    1,
  );
  assert.equal(
    parseBrowseNotes(mergeLimitedModule('browse', '旧：手记', { notes: [item(1), item(2), item(3)] }, config)).length,
    3,
  );
  assert.equal(parseZonePage(mergeLimitedModule('zone', '', { posts: [item(1), item(2)] }, config)).posts.length, 1);
  assert.throws(() => limitModulePatch('memo', '', { notes: '错误数组' }, config));
  assert.equal(
    limitModulePatch(
      'memo',
      '',
      { notes: [{ ...item(1), translation: { language: '错误语言', content: '错误' } }] },
      ModuleSettingsSchema.parse({}),
    ).notes[0].translation,
    undefined,
  );

  for (let cap = 0; cap <= 5; cap++) {
    const cfg = ModuleSettingsSchema.parse({
      memo: { maxNew: cap, maxDoodles: cap },
      zone: { maxNew: cap },
      calendar: { maxNew: cap },
      browse: { maxNew: cap },
    });
    const incoming = Array.from({ length: 9 }, (_, i) => item(i));
    assert.equal(
      parseMemoData(mergeLimitedModule('memo', '', { notes: incoming, doodles: incoming }, cfg)).notes.length,
      cap,
    );
    assert.equal(
      parseMemoData(mergeLimitedModule('memo', '', { notes: incoming, doodles: incoming }, cfg)).doodles.length,
      cap,
    );
    assert.equal(parseCalendar(mergeLimitedModule('calendar', '', { events: incoming }, cfg)).length, cap);
    assert.equal(parseBrowseNotes(mergeLimitedModule('browse', '', { notes: incoming }, cfg)).length, cap);
    assert.equal(parseZonePage(mergeLimitedModule('zone', '', { posts: incoming }, cfg)).posts.length, cap);
  }
  // Actual controls save independently, and calendar does not expose bilingual switches.
  await tick();
  let slider = document.querySelector('input[type=range]');
  slider.value = '5';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  assert.equal(phone.settings.moduleSettings.memo.maxNew, 5);
  assert.equal(vars.global.wave_phone_settings.identifier, 'cn.wave-phone.tavern-helper');
  assert.equal(vars.global.wave_phone_settings.version, 1);
  assert.equal(vars.global.wave_phone_settings.data.moduleSettings.memo.maxNew, 5);
  selected.value = 'calendar';
  await tick();
  assert.equal(document.querySelectorAll('input[type=range]').length, 1);
  assert.equal(document.querySelector('[aria-label="应用自动翻译"]'), null);
  selected.value = 'zone';
  await tick();
  assert.equal(phone.settings.moduleSettings.zone.maxNew, 3);
  selected.value = 'memo';
  await tick();
  phone.settings.moduleSettings.memo.syncChat = false;
  phone.settings.moduleSettings.memo.autoTranslate = true;
  phone.settings.moduleSettings.memo.expandTranslation = true;
  raw.value = JSON.stringify({
    notes: [item('translated')],
    doodles: [
      { ...item('d1'), interpretation: '解释1' },
      { ...item('d2'), interpretation: '解释2' },
    ],
  });
  await tick();
  assert.equal(document.querySelectorAll('.memo-doodle-ticket').length, 2);
  assert(document.querySelector('.module-translation').open);
  assert(document.querySelector('.module-translation').textContent.includes('译文translated'));
  phone.settings.moduleSettings.memo.expandTranslation = false;
  await tick();
  assert.equal(document.querySelector('.module-translation').open, false);
  // Shared language switches are live and do not overwrite independent preferences.
  phone.state.chatPreferences[phone.state.activeCharKey] = require(
    base + '/services/chat-preferences.ts',
  ).ChatPreferencesSchema.parse({
    autoTranslate: true,
    expandTranslation: true,
    sourceLanguage: '日语',
    targetLanguage: '英语',
  });
  await tick();
  document.querySelector('[aria-label="同步私聊双语设置"]').click();
  await tick();
  assert.equal(phone.settings.moduleSettings.memo.syncChat, true);
  assert(document.querySelector('.module-translation').open);
  assert.equal(document.querySelector('[aria-label="应用原文语言"]'), null);
  phone.state.chatPreferences[phone.state.activeCharKey].expandTranslation = false;
  await tick();
  assert.equal(document.querySelector('.module-translation').open, false);
  phone.settings.moduleSettings.memo.syncChat = false;
  // Real store + floor replay uses one saved policy per round, even across multiple blocks.
  let toastCount = 0;
  global.toastr = { info: () => toastCount++ };
  let floors = [];
  global.getChatMessages = id => (typeof id === 'number' ? floors.filter(f => f.message_id === id) : floors);
  await phone.synchronize();
  const id = phone.activeIdentity.stableId || phone.activeIdentity.charKey;
  const delta = notes => ({
    version: 1,
    char_id: id,
    char_name: 'Alice',
    messages: [],
    app_updates: { memo: { notes } },
  });
  phone.settings.moduleSettings.memo.maxNew = 1;
  floors = [
    {
      message_id: 0,
      role: 'assistant',
      message: serializeDelta(delta([item('f1'), item('f2')])) + serializeDelta(delta([item('f3')])),
    },
  ];
  await phone.synchronize();
  assert.equal(phone.syncError, '');
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 1);
  assert.equal(toastCount, 1);
  phone.settings.moduleSettings.memo.maxNew = 5;
  await phone.synchronize();
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 1);
  assert.equal(toastCount, 1);
  // Prompt binding and same snapshot during a pending manual API request.
  const input = {
    cardKey: phone.context.cardKey,
    chatKey: phone.context.chatKey,
    cardName: 'Alice',
    identity: phone.activeIdentity,
    thread: phone.activeThread,
    appSnapshot: phone.activeSnapshot,
    availableStickers: '',
    moduleSettings: config,
  };
  for (const follow of [false, true]) {
    const prompt = buildModulePrompt(input, ['memo'], follow);
    assert(prompt.includes('"maxDoodles":2'));
    assert(prompt.includes('"maxNew":0'));
    assert(prompt.includes('translation'));
    assert(prompt.includes('content 不少于 30 个中文字符'));
    assert(prompt.includes('ASCII Art + emoji'));
    assert(prompt.includes('严禁反引号和 Markdown 代码块'));
    assert(!prompt.includes('calendar={'));
  }
  const statusPrompt = buildModulePrompt(input, ['status'], false);
  for (const field of ['fav', 'fav_delta', 'soc', 'mood', 'hidden_thought', 'organs'])
    assert(statusPrompt.includes(field));
  assert(buildPhonePrompts(input, 'zone').some(p => p.content?.includes('zone 本轮设置')));
  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://example.com/v1';
  phone.settings.api.maxRetries = 0;
  phone.settings.api.model = 'test';
  phone.settings.moduleSettings.memo.maxNew = 1;
  global.getTavernRegexes = () => [];
  global.updateTavernRegexesWith = async fn => fn([]);
  global.createChatMessages = async messages => {
    floors.push(...messages.map((m, i) => ({ ...m, message_id: floors.length + i })));
  };
  global.generateRaw = async () => {
    phone.settings.moduleSettings.memo.maxNew = 5;
    return JSON.stringify(delta([item('manual1'), item('manual2')]));
  };
  const floorCount = floors.length;
  await phone.generateModule('memo');
  assert.equal(floors.length, floorCount);
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 2);
  assert.equal(phone.state.independentAppUpdates.at(-1).app, 'memo');
  assert.equal(phone.state.independentAppUpdates.at(-1).settings.memo.maxNew, 1);
  await phone.synchronize();
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 2);

  // Follow completion constrains stored JSON without injecting floor HTML, with a shared round budget.
  const { constrainPhoneFloor, registerFollowGeneration } = require(base + '/services/follow-generation.ts');
  const policy = ModuleSettingsSchema.parse({ memo: { maxNew: 1 } });
  const floor =
    '正文' + serializeDelta(delta([item('extra1'), item('extra2')])) + serializeDelta(delta([item('extra3')]));
  const constrained = constrainPhoneFloor(floor, policy, id, phone.activeSnapshot);
  assert(constrained.startsWith('正文'));
  assert(constrained.includes('extra1'));
  assert(!constrained.includes('extra2'));
  assert(!constrained.includes('extra3'));
  assert.equal(constrainPhoneFloor(constrained, policy, id, phone.activeSnapshot), constrained);
  const generation = require(base + '/services/generation.ts');
  const requestInput = {
    ...input,
    settings: require(base + '/schemas.ts').ScriptSettingsSchema.parse(phone.settings),
    latestUserText: '更新',
    appSnapshot: phone.activeSnapshot,
  };
  requestInput.settings.moduleSettings.zone.maxNew = 1;
  requestInput.settings.moduleSettings.browse.maxNew = 0;
  global.generateRaw = async () => JSON.stringify({ posts: [item('zone1'), item('zone2')] });
  const zoneResult = await generation.generateZonePage(requestInput);
  assert.equal(zoneResult.posts.length, 1);
  global.generateRaw = async () =>
    JSON.stringify({
      messages: [{ sender: 'char', content: '回复' }],
      app_updates: { browse: { notes: [item('browser-new')] } },
    });
  const replyResult = await generation.generatePhoneReply(requestInput);
  assert.equal(replyResult.data.app_updates.browse.notes.length, 0);
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
    captured,
    patched = '';
  global.injectPrompts = rows => {
    injected = rows[0].content;
    return { uninject: () => {} };
  };
  global.setChatMessages = async rows => {
    patched = rows[0].message;
  };
  phone.settings.generation.followEnabled = true;
  phone.settings.generation.requiredModules = ['memo'];
  phone.settings.generation.probability = 0;
  phone.settings.moduleSettings.memo.maxNew = 1;
  const dispose = registerFollowGeneration(
    () => ({ settings: phone.settings, input: { ...input, moduleSettings: phone.settings.moduleSettings } }),
    () => false,
    (settings, type) => {
      captured = { policy: ModuleSettingsSchema.parse(settings.moduleSettings), type };
    },
  );
  listeners.before('normal', {}, true);
  assert.equal(injected, '');
  listeners.before('regenerate', {}, false);
  assert.equal(captured.type, 'regenerate');
  assert(injected.includes('"maxNew":1'));
  phone.settings.moduleSettings.memo.maxNew = 5;
  floors.push({ message_id: 2, role: 'assistant', message: floor });
  listeners.end(2);
  await tick();
  assert(patched.includes('extra1'));
  assert(!patched.includes('extra2'));
  assert(!patched.includes('wave-phone-card:start'));
  dispose();
  // Upgrading already-synced legacy floors must not erase historical entries beyond the new cap.
  delete vars.chat.wave_phone_chat.modulePolicies;
  floors[0].message = serializeDelta({
    ...delta([]),
    app_updates: {
      memo: Array.from({ length: 7 }, (_, i) => '【旧便签' + i + '】' + String.fromCharCode(10) + '旧内容' + i).join(
        String.fromCharCode(10),
      ),
    },
  });
  floors = floors.slice(0, 1);
  phone.settings.moduleSettings.memo.maxNew = 0;
  await phone.synchronize();
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 8);
  app.unmount();
  console.log(
    'PASS: structured legacy migration, 0–5 limits, separate doodles, shared round budget, stable-ID edits, bilingual UI, app settings persistence, independent manual generation and replay.',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
