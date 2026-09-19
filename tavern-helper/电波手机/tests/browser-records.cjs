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
  Browser = require(base + '/components/apps/WaveBrowserPanel.vue').default;
let phone;
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    return () =>
      vue.h(Browser, {
        raw: '',
        history: phone.state.browser[phone.activeIdentity?.charKey]?.history || [],
        bookmarks: phone.state.browser[phone.activeIdentity?.charKey]?.bookmarks || [],
        engine: 'google',
        endpoint: '',
        onRemove: phone.removeBrowserEntry,
      });
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
  const key = phone.activeIdentity.charKey,
    entry = {
      id: 'web-1',
      title: '测试网页',
      url: 'https://example.com/',
      query: '',
      visitedAt: new Date().toISOString(),
    };
  phone.recordBrowserVisit(entry);
  phone.toggleBrowserBookmark(entry);
  phone.state.browser.other = { history: [entry], bookmarks: [entry] };
  await tick();
  clickText('button', '历史记录');
  await tick();
  document.querySelector('[aria-label="删除历史记录：测试网页"]').click();
  await tick();
  assert.equal(phone.state.browser[key].history.length, 0);
  assert.equal(phone.state.browser[key].bookmarks.length, 1);
  assert.equal(phone.state.browser.other.history.length, 1);
  await phone.synchronize();
  assert.equal(phone.state.browser[key].history.length, 0);
  clickText('button', '收藏夹');
  await tick();
  document.querySelector('[aria-label="删除收藏：测试网页"]').click();
  await tick();
  assert.equal(phone.state.browser[key].bookmarks.length, 0);
  await phone.synchronize();
  assert.equal(phone.state.browser[key].bookmarks.length, 0);
  assert.equal(phone.state.browser.other.bookmarks.length, 1);
  app.unmount();
  console.log(
    'PASS: actual browser single-history and bookmark deletion, independent lists, persistence and character isolation.',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
