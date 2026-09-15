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
let vars = { script: {}, chat: {} };
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
  Presets = require(base + '/components/WavePresets.vue').default,
  { phoneSurfaceKey } = require(base + '/services/ui-context.ts');
const { defaultPresetItems, resolvePresetEntries, buildPhonePrompts, buildModulePrompt, presetMomentsRules } = require(
  base + '/prompts/index.ts',
);
const { createPreset, movePresetEntry, savePresetEntry, deletePresetEntry } = require(base + '/services/presets.ts');
let phone;
const surface = vue.ref(null);
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    vue.provide(phoneSurfaceKey, surface);
    return () => vue.h('section', { ref: surface }, vue.h(Presets));
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick(),
  clickText = (selector, text) => {
    const el = [...document.querySelectorAll(selector)].find(el => el.textContent.includes(text));
    assert(el, 'missing ' + text);
    el.click();
  };
(async () => {
  await phone.synchronize();
  await tick();
  assert(document.querySelectorAll('.preset-entry.is-divider').length > 5);
  assert.equal(document.querySelectorAll('.preset-entry-actions').length, 0);
  assert(document.querySelector('.heading-major').textContent.includes('预设头部'));
  assert(!document.querySelector('.heading-major .preset-entry-title').textContent.includes('=='));
  assert(document.querySelector('.heading-minor'));
  assert(document.querySelector('.phone-section-start'));
  const ordinary = document.querySelector('.preset-entry:not(.is-divider):not(.is-phone-entry) [role=switch]');
  assert(!ordinary.disabled);
  const initial = ordinary.getAttribute('aria-checked');
  ordinary.click();
  await tick();
  assert.notEqual(ordinary.getAttribute('aria-checked'), initial);
  assert(Object.keys(phone.settings.presets.defaultToggles).length === 1);
  assert(
    [...document.querySelectorAll('.is-phone-entry [role=switch]')].every(
      button => button.disabled && button.getAttribute('aria-checked') === 'true',
    ),
  );
  const original = JSON.stringify(defaultPresetItems());
  assert.throws(() => movePresetEntry(phone.settings.presets, 'default', 0, 1), /不可编辑/);
  clickText('.preset-entry-title', '朋友圈互动');
  await tick();
  assert(document.querySelector('.presets-editor textarea').readOnly);
  assert([...document.querySelectorAll('.presets-editor .wave-select-trigger')].every(button => button.disabled));
  document.querySelector('.presets-editor [aria-label="关闭"]').click();
  await tick();
  clickText('.presets-toolbar button', '复制完整预设');
  await tick();
  clickText('.presets-editor button', '保存预设');
  await tick();
  assert.equal(phone.settings.presets.items.length, 1);
  assert(document.querySelector('.preset-entry-actions'));
  const preset = phone.settings.presets.items[0],
    first = preset.entries[0].id;
  document.querySelectorAll('.preset-entry-actions button')[1].click();
  await tick();
  assert.equal(phone.settings.presets.items[0].entries[1].id, first);
  const before = phone.settings.presets.items[0].entries.length;
  clickText('.preset-entry-actions button', '复制');
  await tick();
  assert.equal(phone.settings.presets.items[0].entries.length, before + 1);
  clickText('.preset-entry-actions button', '删除');
  await tick();
  assert.equal(phone.settings.presets.items[0].entries.length, before);
  clickText('.presets-summary button', '使用此预设');
  await tick();
  assert.equal(phone.settings.presets.activeId, preset.id);
  const entry = {
    id: 'test-entry',
    order: 200,
    name: '行为补充',
    enabled: true,
    kind: 'custom',
    scope: 'all',
    content: 'CUSTOM-ORDER-TEST',
    divider: false,
  };
  savePresetEntry(phone.settings.presets, preset.id, entry);
  const args = {
    presets: phone.settings.presets,
    cardKey: 'x',
    chatKey: 'x',
    cardName: 'Alice',
    identity: phone.activeIdentity,
    thread: phone.activeThread,
    appSnapshot: phone.activeSnapshot,
    availableStickers: '',
  };
  assert(buildPhonePrompts(args).some(item => item.content === 'CUSTOM-ORDER-TEST'));
  assert(!buildPhonePrompts(args).some(item => item.content === '[世界引擎]'));
  assert(buildModulePrompt(args, ['memo'], false).includes('CUSTOM-ORDER-TEST'));
  const fresh = createPreset(phone.settings.presets, '空白系统');
  assert(fresh.entries.some(item => item.systemKey === '电波手机·朋友圈互动'));
  assert(fresh.entries.some(item => item.source === 'user_input'));
  assert(fresh.entries.every(item => item.systemKey));
  assert.equal(JSON.stringify(defaultPresetItems()), original);
  phone.settings.presets.activeId = fresh.id;
  const momentEntry = fresh.entries.find(item => item.scope === 'moments');
  assert.throws(
    () => savePresetEntry(phone.settings.presets, fresh.id, { ...momentEntry, content: 'MOMENTS-CUSTOM' }),
    /锁定/,
  );
  assert.throws(() => deletePresetEntry(phone.settings.presets, fresh.id, momentEntry.id), /锁定/);
  fresh.entries = fresh.entries.filter(item => item.id !== momentEntry.id);
  assert(
    resolvePresetEntries(phone.settings.presets).some(item => item.systemKey === '电波手机·朋友圈互动' && item.enabled),
  );
  app.unmount();
  console.log(
    'PASS: actual presets UI read-only detail, copy, move, duplicate/delete, activate; system-seeded new preset, runtime custom prompt use and immutable default.',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
