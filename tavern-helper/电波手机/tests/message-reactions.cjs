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
let app;
(async () => {
  await phone.synchronize();
  const message = PhoneMessageSchema.parse({
    id: 'react-test',
    sender: 'char',
    content: '切，谁会迟到啊。',
    createdAt: new Date().toISOString(),
  });
  phone.activeThread.messages.push(message);
  phone.toggleReaction(message.id, '❤️');
  assert.deepEqual(phone.activeThread.messages[0].reactions, ['❤️']);
  phone.toggleReaction(message.id, 'bad text');
  assert.deepEqual(phone.activeThread.messages[0].reactions, ['❤️']);
  phone.toggleReaction(message.id, '❤️');
  assert.deepEqual(phone.activeThread.messages[0].reactions, []);
  for (const emoji of ['❤️', '🥰', '👍', '👌', '😂', '🤔', '😊']) phone.toggleReaction(message.id, emoji);
  assert.equal(phone.activeThread.messages[0].reactions.length, 6);
  phone.state.threads['reaction-forward-target'] = ThreadSchema.parse({
    id: 'reaction-forward-target',
    charKey: 'other-char',
    updatedAt: new Date().toISOString(),
  });
  phone.forwardMessage(message.id, 'other-char');
  assert.deepEqual(phone.state.threads['reaction-forward-target'].messages[0].reactions, []);
  assert.equal(phone.activeThread.messages.length, 1);
  phone.editMessage(message.id, '改一下消息');
  assert.equal(phone.activeThread.messages[0].reactions.length, 6);
  await phone.synchronize();
  assert.equal(phone.activeThread.messages.find(m => m.id === message.id).reactions.length, 6);
  chatKey = 'chat-B';
  await phone.synchronize();
  assert(!phone.activeThread.messages.some(m => m.id === message.id));
  chatKey = 'chat-A';
  await phone.synchronize();
  assert.equal(phone.activeThread.messages.find(m => m.id === message.id).reactions.length, 6);
  const own = PhoneMessageSchema.parse({ id: 'own', sender: 'user', createdAt: new Date().toISOString() });
  phone.activeThread.messages.push(own);
  phone.toggleReaction(own.id, '❤️');
  assert(!phone.activeThread.messages.find(m => m.id === own.id).reactions?.length);
  const withdrawn = PhoneMessageSchema.parse({ ...message, id: 'withdrawn', withdrawn: true, reactions: [] });
  phone.activeThread.messages.push(withdrawn);
  phone.toggleReaction(withdrawn.id, '❤️');
  assert(!phone.activeThread.messages.find(m => m.id === withdrawn.id).reactions?.length);
  const selected = vue.ref(['❤️']);
  app = vue.createApp({
    setup: () => () =>
      vue.h(Picker, {
        selected: selected.value,
        recent: ['🥰'],
        onSelect: emoji =>
          (selected.value = selected.value.includes(emoji)
            ? selected.value.filter(x => x !== emoji)
            : [...selected.value, emoji]),
      }),
  });
  app.mount('#app');
  assert.equal(document.querySelectorAll('.reaction-quick-row button').length, 7);
  document.querySelector('[aria-label="更多反应表情"]').click();
  await vue.nextTick();
  assert(document.body.textContent.includes('最近使用'));
  assert(document.querySelectorAll('.reaction-emoji-grid button').length > 100);
  document.querySelector('[aria-label="反应 ❤️"]').click();
  await vue.nextTick();
  assert.deepEqual(selected.value, []);
  [...document.querySelectorAll('.reaction-categories button')].find(el => el.textContent === '美食').click();
  await vue.nextTick();
  const grape = [...document.querySelectorAll('.reaction-emoji-grid button')].find(
    button => button.textContent === '🍇',
  );
  assert(grape);
  assert.equal(grape.getAttribute('aria-label'), '反应 🍇');
  selected.value = ['❤️', '🥰', '👍', '👌', '😂', '🤔'];
  await vue.nextTick();
  assert(grape.disabled);
  assert(!document.querySelector('[aria-label="反应 ❤️"]').disabled);
  phone.deleteMessage(message.id);
  assert(!phone.activeThread.messages.some(m => m.id === message.id));
  console.log(
    'PASS: reaction persistence, chat isolation, toggle, validation, cap, edit/delete, withdrawn/own guards and emoji picker',
  );
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.unmount());
