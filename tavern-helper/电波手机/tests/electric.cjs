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

global.MutationObserver = dom.window.MutationObserver;
const { splitElectric } = require(base + '/services/electric.ts'),
  { registerElectricDisplay } = require(base + '/services/electric-display.ts');
assert.deepEqual(splitElectric('<electric>one {x}</electric>\n{"ok":true}'), {
  electric: 'one {x}',
  body: '{"ok":true}',
});
assert.equal(splitElectric('<electric>incomplete').body, '');
const chat = document.createElement('div');
chat.id = 'chat';
chat.innerHTML = '<div class="mes" mesid="0"><div class="mes_text"><p>正文</p></div></div>';
document.body.append(chat);
global.getChatMessages = () => [{ message: '<electric><img src=x onerror=alert(1)>解释</electric>正文' }];
let hidden = false;
const display = registerElectricDisplay(() => hidden);
assert(document.querySelector('.wave-electric-host'));
assert(!document.querySelector('.wave-electric-host').open);
assert(!document.querySelector('.wave-electric-host img'));
assert(document.querySelector('.wave-electric-host pre').textContent.includes('<img'));
display.refresh();
assert.equal(document.querySelectorAll('.wave-electric-host').length, 1);
hidden = true;
display.refresh();
assert(!document.querySelector('.wave-electric-host'));
display.dispose();
const { defaultPresetItems, buildPhonePrompts, buildModulePrompt } = require(base + '/prompts/index.ts');
const defaults = defaultPresetItems();
assert.deepEqual(
  defaults.slice(-3).map(e => e.name),
  ['💡预设思维', '👑授权协议', '🔒预设尾部'],
);
assert(!defaults.at(-1).content.includes('thinking'));
const { ChatStateSchema, AppSnapshotSchema, IdentitySchema, ThreadSchema } = require(base + '/schemas.ts');
const input = {
  cardKey: 'a',
  chatKey: 'a',
  cardName: 'Alice',
  identity: { charKey: 'a', name: 'Alice' },
  thread: { id: 't', messages: [] },
  appSnapshot: AppSnapshotSchema.parse({}),
  availableStickers: '',
};
for (const follow of [false, true]) {
  const prompt = buildModulePrompt(input, ['memo'], follow);
  assert(prompt.includes('备忘更新'));
  assert(!prompt.includes('钱包更新'));
  assert(!prompt.includes('空间动态]'));
}
const prompt = buildPhonePrompts(input)
  .filter(x => typeof x !== 'string')
  .map(x => x.content)
  .join('\n');
assert(prompt.includes('私聊回复'));
assert(!prompt.includes('钱包更新'));
console.log(
  'PASS: electric extraction, safe collapsed host rendering/hide/deduplication, preset tail order and app-specific prompt activation.',
);
