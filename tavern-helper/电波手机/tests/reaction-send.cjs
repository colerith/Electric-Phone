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
const { usePhoneStore } = require(base + '/stores/phone.ts');
const { PhoneMessageSchema } = require(base + '/schemas.ts');
let phone;
const app = vue.createApp({ setup() { phone = usePhoneStore(); phone.settings.basic.cacheEnabled = false; return () => null; } });
app.use(createPinia()).mount('#app');
(async () => {
  await phone.synchronize();
  phone.settings.sendMode = 'main_api';
  let calls = [];
  global.triggerSlash = async command => calls.push(command);
  await phone.sendMessage('待回复消息', false);
  const before = phone.activeThread.messages.length;
  await phone.sendMessage({ type: 'text', content: '  ', payload: { mentions: [] } }, true);
  assert.equal(phone.activeThread.messages.length, before);
  assert.equal(calls.length, 1);
  assert(calls[0].includes('待回复消息'));
  await phone.sendMessage({ type: 'text', content: '', payload: { mentions: [], quote: { text: '引用' } } }, true);
  assert.equal(phone.activeThread.messages.length, before);
  assert.equal(calls.length, 1);
  phone.activeThread.messages.push(PhoneMessageSchema.parse({ id: 'char-test', sender: 'char', type: 'text', content: '给我加薪', status: 'sent', createdAt: new Date().toISOString() }));
  phone.toggleReaction('char-test', '❤️');
  const notice = phone.activeThread.messages.at(-1);
  assert.equal(notice.payload.interaction, 'message_reaction');
  assert.equal(notice.sender, 'system');
  assert.equal(notice.payload.targetName, 'Alice');
  assert(notice.content.includes('给我加薪'));
  assert.equal(calls.length, 1, '回应不应自动触发生成');
  await phone.sendMessage({ type: 'text', content: '', payload: { mentions: [] } }, true);
  assert.equal(calls.length, 2);
  assert(calls[1].includes('消息回应事件'));
  assert(calls[1].includes('❤️'));
  assert(calls[1].includes('char-test'));
  assert.equal(notice.payload.awaitingReply, undefined);
  phone.toggleReaction('char-test', '❤️');
  assert.equal(phone.activeThread.messages.at(-1).payload.action, 'remove');
  assert(phone.activeThread.messages.at(-1).content.includes('取消'));
  const count = phone.activeThread.messages.length;
  phone.toggleReaction('char-test', 'invalid');
  assert.equal(phone.activeThread.messages.length, count);
  const alice = phone.activeIdentity.charKey;
  const bob = phone.addContact('Bob', '朋友');
  const group = phone.createGroup('测试群', [alice, bob]);
  phone.selectIdentity(group);
  phone.activeThread.messages.push(PhoneMessageSchema.parse({ id: 'group-target', sender: 'char', type: 'voice', content: '群聊语音', payload: { actorKey: bob }, status: 'sent', createdAt: new Date().toISOString() }));
  phone.toggleReaction('group-target', '👍');
  assert.equal(phone.activeThread.messages.at(-1).payload.targetName, 'Bob');
  assert.equal(phone.activeThread.messages.at(-1).payload.targetKey, bob);
  await phone.sendMessage({ type: 'text', content: '', payload: { mentions: [] } }, true);
  assert(calls.at(-1).includes('Bob'));
  assert(calls.at(-1).includes('群聊语音'));
  const mediaCount = phone.activeThread.messages.length;
  await phone.sendMessage({ type: 'image', content: '', payload: { url: 'https://example.com/image.png' } }, false);
  assert.equal(phone.activeThread.messages.length, mediaCount + 1, '附件仍可无正文发送');
  console.log('PASS: empty metadata does not append messages; queued reply activates; reaction notice and prompt; cancellation and invalid emoji');
  app.unmount();
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
