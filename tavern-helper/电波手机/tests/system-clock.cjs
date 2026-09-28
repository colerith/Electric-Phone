const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div><div id="bbs"></div>', { url: 'http://localhost' });
for (const key of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Event',
  'MouseEvent',
  'MutationObserver',
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
let chat = 'clock-one',
  vars = { global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', characterId: '1', groupId: '', getCurrentChatId: () => chat },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getVariables: ({ type }) => vars[type],
  replaceVariables: (value, { type }) => (vars[type] = value),
});
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { SystemClockSettingsSchema: Schema, parseCivilTime, resolveClock, clockLabels, readBaiBaiTime } = require(
  base + '/services/core/system-clock.ts',
);
const vue = require('vue'),
  { createPinia, setActivePinia } = require('pinia');
const pinia = createPinia();
setActivePinia(pinia);
const phone = require(base + '/stores/phone.ts').usePhoneStore();
const clock = require(base + '/stores/system-clock.ts').useSystemClockStore();
const panel = require(base + '/components/settings/WaveClockSettings.vue').default;
const app = vue.createApp(panel).use(pinia);
app.mount('#app');
const realNow = Date.now;
let now = Date.UTC(2026, 0, 1, 18, 5);
Date.now = () => now;
const tick = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await vue.nextTick();
};
const bbs = document.querySelector('#bbs');
const markup = text =>
  `<div class="bbs-state"><div class="bbs-state-item"><span class="bbs-state-key">时间</span><span class="bbs-state-val">${text}</span></div><div class="bbs-state-item"><span class="bbs-state-key">地点</span><span class="bbs-state-val">2099/1/1 12:00</span></div></div>`;
(async () => {
  assert.equal(clockLabels(resolveClock(Schema.parse({}), now, '')).full, '2026-01-02 02:05（周五）');
  assert.equal(
    clockLabels(resolveClock(Schema.parse({ timeZone: 'offset', offsetMinutes: -210 }), now, '')).time,
    '14:35',
  );
  assert.equal(
    clockLabels(resolveClock(Schema.parse({ timeZone: 'America/New_York' }), Date.UTC(2026, 6, 1, 12), '')).time,
    '08:00',
  );
  assert.equal(parseCivilTime('2018/7/3 22:30 (周二)'), Date.UTC(2018, 6, 3, 22, 30));
  for (const bad of ['2025/2/29 10:00', '2018/7/3 25:00', '2018/7/3 18:30 → 2018/7/3 22:30', '这里没有时间'])
    assert.equal(parseCivilTime(bad), null);
  assert.notEqual(parseCivilTime('2024-02-29T10:00'), null);
  clock.start(window);
  phone.settings.basic.systemClock.source = 'baibai';
  await tick();
  assert.equal(clock.labels.time, '--:--');
  window.STBaiBaiBook = { getSnapshot: () => ({ chat: { id: chat }, state: { time: '2018/7/3 22:00' } }) };
  bbs.innerHTML = markup('2018/7/3 22:30 (周二)');
  await tick();
  assert.equal(readBaiBaiTime(document).text, '2018/7/3 22:30 (周二)');
  assert.equal(clock.labels.time, '22:30');
  now += 86400000;
  clock.refresh();
  assert.equal(clock.labels.full, '2018-07-03 22:30（周二）', 'story clock must never advance on its own');
  bbs.querySelector('.bbs-state-val').firstChild.data = '2018/7/4 00:05 (周三)';
  await tick();
  assert.equal(clock.labels.date, '2018-07-04');
  assert.equal(clock.labels.time, '00:05');
  bbs.innerHTML = '';
  await tick();
  assert.equal(clock.labels.time, '00:05', 'closing panel must not rewind to older summary memory');
  window.STBaiBaiBook = { getSnapshot: () => ({ chat: { id: chat }, state: { time: '2018/7/4 00:20' } }) };
  window.dispatchEvent(new Event('st-baibai-book:changed'));
  await tick();
  assert.equal(clock.labels.time, '00:20');
  bbs.innerHTML = markup('2018/7/4 00:25');
  await tick();
  delete window.STBaiBaiBook;
  chat = 'clock-two';
  clock.refresh();
  assert.equal(clock.labels.time, '--:--', 'new chat cannot inherit stale DOM');
  bbs.querySelector('.bbs-state-val').textContent = '2020/1/1 11:00';
  await tick();
  assert.equal(clock.labels.date, '2020-01-01');
  phone.settings.basic.systemClock.source = 'custom';
  await tick();
  phone.settings.basic.systemClock.customTime = '2000-12-31T23:59';
  phone.settings.basic.systemClock.customAnchor = now;
  phone.settings.basic.systemClock.customRunning = false;
  await tick();
  now += 120000;
  clock.refresh();
  assert.equal(clock.labels.time, '23:59');
  phone.settings.basic.systemClock.customRunning = true;
  phone.settings.basic.systemClock.customAnchor = now;
  await tick();
  now += 120000;
  clock.refresh();
  assert.equal(clock.labels.full, '2001-01-01 00:01（周一）');
  assert(document.querySelector('input[type=datetime-local]'));
  assert(document.body.textContent.includes('自动走时'));
  phone.saveSettings();
  const { SCRIPT_VARIABLE_KEY } = require(base + '/schemas.ts');
  assert.equal(vars.global[SCRIPT_VARIABLE_KEY].data.basic.systemClock.customTime, '2000-12-31T23:59');
  phone.settings.basic.systemClock.source = 'baibai';
  await tick();
  clock.stop();
  const stopped = clock.labels.full;
  bbs.innerHTML = markup('2040/1/1 10:00');
  await tick();
  assert.equal(clock.labels.full, stopped, 'stop disconnects observers');
  if (process.env.WAVE_QA_HTML) fs.writeFileSync(process.env.WAVE_QA_HTML, document.querySelector('#app').innerHTML);
  console.log(
    'PASS: timezone/DST, custom clock, frozen live BaiBai DOM, API fallback, chat isolation, cleanup and settings persistence.',
  );
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    clock.stop();
    app.unmount();
    Date.now = realNow;
  });
