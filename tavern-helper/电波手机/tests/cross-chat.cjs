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

const generation = require(base + '/services/generation/generation.ts');
const { ChatPreferencesSchema } = require(base + '/services/chat/chat-preferences.ts');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
(async () => {
  await phone.synchronize();
  const actor = phone.state.activeCharKey;
  phone.state.identities.other = require(base + '/schemas.ts').IdentitySchema.parse({
    ...phone.state.identities[actor],
    charKey: 'other',
    name: 'Other',
    source: 'local_contact',
  });
  const group = phone.createGroup('联动测试', [actor, 'other']);
  phone.settings.api.enabled = true;
  phone.settings.sendMode = 'secondary_api';
  phone.settings.generation.narrativeMode = 'independent';
  const calls = [];
  generation.generatePhoneReply = async input => {
    calls.push(input);
    const cross = input.latestUserText.includes('跨聊天的角色主动发言');
    return {
      generationId: input.generationId,
      data: {
        thread_id: input.thread.id,
        context_relation: 'independent',
        app_updates: {},
        messages: Array.from({ length: cross ? input.settings.chat.minReplies : 1 }, () => ({
          sender: 'char',
          type: 'text',
          content: cross ? '联动消息' : '正常回复',
          payload: input.identity.source === 'local_group' ? { actorKey: actor } : {},
        })),
      },
    };
  };
  phone.selectIdentity(actor);
  phone.setChatPreferences(ChatPreferencesSchema.parse({ crossChatEnabled: true, crossChatProbability: 100 }));
  await phone.sendMessage('hello', true);
  await tick();
  const groupThread = Object.values(phone.state.threads).find(t => t.charKey === group);
  assert(groupThread.messages.filter(m => m.payload.crossChatSource).length >= 1);
  assert(groupThread.messages.filter(m => m.payload.crossChatSource).length <= 3);
  assert.equal(phone.state.activeCharKey, actor);
  phone.selectIdentity(group);
  phone.setChatPreferences(ChatPreferencesSchema.parse({ crossChatEnabled: true, crossChatProbability: 100 }));
  await phone.sendMessage('group hello', true);
  await tick();
  const privateThread = Object.values(phone.state.threads).find(t => t.charKey === actor);
  assert(privateThread.messages.some(m => m.payload.crossChatSource === group));
  assert.equal(calls.length, 4, 'cross replies do not loop');
  phone.setChatPreferences(ChatPreferencesSchema.parse({ crossChatEnabled: true, crossChatProbability: 0 }));
  await phone.sendMessage('zero', true);
  await tick();
  assert.equal(calls.length, 5, 'zero probability never triggers');
  phone.dispose();
  console.log('PASS bidirectional cross-chat, 1–3 messages, no navigation, no loops and zero probability');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
