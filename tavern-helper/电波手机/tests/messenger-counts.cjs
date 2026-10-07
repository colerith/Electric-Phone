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
let chatKey = 'chat-A';
const chats = { 'chat-A': {}, 'chat-B': {}, 'chat-other': {} },
  vars = { global: {}, script: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chatKey, characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => (type === 'chat' ? chats[chatKey] : vars[type]),
  replaceVariables: (value, { type }) => {
    if (type === 'chat') chats[chatKey] = value;
    else vars[type] = value;
  },
});

const vue = require('vue'),
  { createPinia, setActivePinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const { PhoneMessageSchema, ThreadSchema } = require(base + '/schemas.ts');
const Picker = require(base + '/components/chat/WaveReactionPicker.vue').default;
setActivePinia(createPinia());
const phone = usePhoneStore();
phone.settings.basic.cacheEnabled = false;

(async () => {
 await phone.synchronize();
 const actor = phone.state.activeCharKey;
 phone.state.identities.other = require(base + '/schemas.ts').IdentitySchema.parse({ ...phone.state.identities[actor], charKey: 'other', name: 'Other', source: 'local_contact' });
 const group = phone.createGroup('统计测试', [actor, 'other']);
 const Messenger = require(base + '/components/chat/WaveMessenger.vue').default;
 const app = vue.createApp({ render: () => vue.h(Messenger, { userName: 'User', userAvatar: '' }) });
 app.use(require('pinia').getActivePinia());
 app.mount('#app');
 await vue.nextTick();
 const text = () => document.body.textContent;
 assert(text().includes('2 位联系人 · 1 个群聊'));
 phone.removeConversation(group); await vue.nextTick();
 assert(text().includes('2 位联系人 · 0 个群聊'));
 phone.deleteContact('other'); await vue.nextTick();
 assert(text().includes('1 位联系人 · 0 个群聊'));
 phone.startConversation(group); await vue.nextTick();
 assert(text().includes('1 位联系人 · 1 个群聊'));
 app.unmount(); phone.dispose();
 console.log('PASS live contact/group counts after hide, delete and reopen');
})().catch(e => { console.error(e); process.exitCode = 1; });
