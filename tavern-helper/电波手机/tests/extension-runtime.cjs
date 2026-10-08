const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { EventEmitter } = require('node:events');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="extensions_settings2"></div><div id="extensionsMenu"></div>', {
  url: 'http://localhost',
  runScripts: 'dangerously',
});
global.window = dom.window;
global.document = dom.window.document;
const source = new EventEmitter();
let context = { name1: 'A', eventSource: source, eventTypes: { CHAT_CHANGED: 'chat_changed' } };
window.SillyTavern = { getContext: () => context };
const scopes = { extension: {}, global: { keep: 1 }, chat: { oldMessages: [1] } };
const legacy = {
  type: 'script',
  id: 'old',
  enabled: false,
  content: "import 'https://cdn.jsdelivr.net/gh/colerith/Electric-Phone@v1.2.43/file/index-1.2.43.js'",
  data: { wave_phone_power: { level: 58 }, wave_phone_settings: { data: { keep: true } }, unrelated: 'retain' },
};
window.TavernHelper = {
  getVariables: option => structuredClone(scopes[option.type]),
  replaceVariables: (data, option) => {
    assert.notEqual(option.type, 'script');
    scopes[option.type] = structuredClone(data);
  },
  getScriptTrees: ({ type }) => (type === 'global' ? [legacy] : []),
  tavern_events: context.eventTypes,
};
const workspace = fs.existsSync('src/util/酒馆助手脚本/电波手机');
const root = path.resolve(workspace ? 'src/util/酒馆助手脚本/电波手机' : 'tavern-helper/电波手机');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] || require(id), m, m.exports);
  return m.exports;
}
const bridge = load('extension/bridge.ts');
assert.equal(bridge.SillyTavern.name1, 'A');
context = { ...context, name1: 'B' };
assert.equal(bridge.SillyTavern.name1, 'B', 'context is live across chat changes');
bridge.migrateLegacyVariables();
assert.equal(scopes.extension.wave_phone_power.level, 58);
assert.equal(scopes.extension.unrelated, undefined);
assert.equal(legacy.data.unrelated, 'retain');
bridge.replaceVariables({ ...scopes.extension, wave_phone_power: { level: 80 } }, { type: 'script' });
bridge.migrateLegacyVariables();
assert.equal(scopes.extension.wave_phone_power.level, 80, 'migration is idempotent');
assert.equal(bridge.getVariables({ type: 'chat' }).oldMessages[0], 1);
assert.equal(scopes.global.keep, 1);
let called = 0;
const sub = bridge.eventOn('event', () => called++);
source.emit('event');
sub.stop();
source.emit('event');
assert.equal(called, 1);
bridge.eventOn('event', () => called++);
bridge.stopExtensionEvents();
assert.equal(source.listenerCount('event'), 0);
let initialized = 0,
  opened = 0;
global.$ = fn => fn();
const appMock = {
  initialize: async () => {
    initialized++;
  },
  cleanup() {},
  openPhone() {
    opened++;
  },
};
legacy.enabled = true;
load('extension/index.ts', {
  '../index': appMock,
  './bridge': bridge,
  '../schemas': { WAVE_PHONE_RELEASE_VERSION: '1.3.2' },
});
const tick = () => new Promise(r => setImmediate(r));
(async () => {
  await tick();
  assert.equal(initialized, 0);
  assert.match(document.querySelector('#wave-phone-extension-settings').textContent, /停用旧脚本/);
  assert.ok(document.querySelector('#wave-phone-extension-settings .inline-drawer-header'));
  assert.ok(document.querySelector('#wave-phone-extension-settings .inline-drawer-content'));
  legacy.enabled = false;
  const stale = document.createElement('div');
  stale.id = 'wave-phone-script-root';
  document.body.append(stale);
  document.querySelector('#wave-phone-extension-settings button').click();
  await tick();
  assert.equal(initialized, 0, 'stale runtime must not be started twice');
  assert.match(document.querySelector('#wave-phone-extension-settings').textContent, /残留/);
  assert.equal(document.querySelectorAll('#wave-phone-extension-settings button')[1].hidden, false);
  stale.remove();
  document.querySelector('#wave-phone-extension-settings button').click();
  await tick();
  assert.equal(initialized, 1);
  assert.equal(opened, 1);
  document.querySelector('#wave-phone-extension-menu').click();
  await tick();
  assert.equal(initialized, 1);
  assert.equal(opened, 2);
  window.dispatchEvent(new window.Event('pagehide'));
  assert.equal(document.querySelector('#wave-phone-extension-settings'), null);
  // Full compiled artifact bootstraps without iframe globals or a running helper.
  delete window.TavernHelper;
  delete window.SillyTavern;
  window.jQuery = require('jquery');
  window.toastr = { warning() {}, error() {}, info() {} };
  const errors = [];
  window.addEventListener('error', e => errors.push(e.error));
  window.eval(fs.readFileSync(path.resolve(workspace ? 'dist/wave-extension/index.js' : 'dist/index.js'), 'utf8'));
  await new Promise(r => setTimeout(r, 100));
  assert.equal(window.Vue, undefined, 'Vue is bundled, not injected into host globals');
  assert.ok(document.querySelector('#wave-phone-extension-settings button'), 'recovery entry exists without helper');
  assert.deepEqual(errors, []);
  window.dispatchEvent(new window.Event('pagehide'));
  dom.window.close();
  console.log(
    'extension: live context, scoped migration, event cleanup, duplicate guard, retry and bundled bootstrap passed',
  );
})().catch(error => {
  console.error(error);
  dom.window.close();
  process.exitCode = 1;
});
