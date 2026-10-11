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
let chatId = 'test';
Object.assign(global, {
  SillyTavern: {
    name1: 'User',
    getCurrentChatId: () => chatId,
    characterId: '1',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    characters: [{ name: 'Other', avatar: 'other.png' }],
  },
  getCharData: value =>
    value === 'other.png'
      ? { name: 'Other', avatar: 'other.png', shallow: true }
      : { name: 'Alice', description: '角色卡描述：喜欢旅行。' },
  fetch: async (url, options) => {
    assert.equal(url, '/api/characters/get');
    assert.equal(JSON.parse(options.body).avatar_url, 'other.png');
    return {
      ok: true,
      json: async () => ({ name: 'Other', avatar: 'other.png', data: { description: '其他卡片描述' } }),
    };
  },
  getWorldbookNames: () => ['其他世界书', '角色设定'],
  getCharWorldbookNames: () => ({ primary: '角色设定', additional: [] }),
  getWorldbook: async () => [{ uid: 7, name: 'Dora', content: '世界书角色资料'.repeat(200) }],
  getCharAvatarPath: value => (value === 'other.png' ? '/characters/other.png' : ''),
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve(__dirname, '..');
const { usePhoneStore } = require(base + '/stores/phone.ts'),
  Messenger = require(base + '/components/chat/WaveMessenger.vue').default,
  GroupSettings = require(base + '/components/chat/WaveGroupSettings.vue').default,
  Generation = require(base + '/components/settings/WaveGenerationSettings.vue').default,
  { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const { chooseFollowModules } = require(base + '/services/generation/follow-generation.ts'),
  { buildChatReference, resolveNarrativeRelation } = require(base + '/services/generation/narrative-context.ts');
const { buildModulePrompt, buildPhonePrompts } = require(base + '/prompts/index.ts');
let phone, component;
const surface = vue.ref(null);
let opened = '';
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h('section', { ref: surface }, [
        vue.h(Messenger, {
          ref: v => (component = v),
          userName: 'User',
          userAvatar: '',
          onOpen: key => (opened = key),
        }),
        vue.h(Generation),
        vue.h(GroupSettings, { userAvatar: '/User Avatars/persona.png' }),
      ]);
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const clickText = (selector, text) => {
  const button = [...document.querySelectorAll(selector)].find(el => el.textContent.includes(text));
  assert(button, 'missing ' + text);
  button.click();
};
(async () => {
  await phone.synchronize();
  await tick();
  assert.equal(document.querySelector('.messenger-search'), null);
  await component.toggleSearch();
  const input = document.querySelector('.messenger-search-top input');
  assert(input);
  assert.equal(document.activeElement, input);
  assert.equal(document.querySelector('.messenger-bottom .messenger-search'), null);
  input.value = '不存在的联系人';
  input.dispatchEvent(new Event('input', {bubbles:true}));
  await tick();
  assert.equal(document.querySelectorAll('.messenger-row').length, 0);
  await component.toggleSearch();
  await tick();
  assert.equal(document.querySelector('.messenger-search'), null);
  assert.equal(document.querySelectorAll('.messenger-row').length, 1);
  app.unmount();
  console.log('PASS: search hidden initially, expands at top, focuses, filters and restores list when closed');
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
