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
  Contact = require(base + '/components/chat/WaveContactSettings.vue').default,
  Cleanup = require(base + '/components/chat/WaveChatCleanup.vue').default,
  { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const { buildPhonePrompts } = require(base + '/prompts/index.ts'),
  { phoneHistory } = require(base + '/services/chat/chat-history.ts'),
  { prepareContext } = require(base + '/services/generation/context-controls.ts'),
  { buildChatReference } = require(base + '/services/generation/narrative-context.ts');
const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
const delta = content =>
  serializeDelta({
    version: 1,
    char_id: 'alice',
    char_name: 'Alice',
    messages: [{ client_id: content, sender: 'char', type: 'text', content, created_at: '', payload: {} }],
    app_updates: { memo: '保留备忘' },
  });
let floors = [{ message_id: 0, role: 'assistant', message: delta('OLD-FLOOR') }];
global.getChatMessages = () => floors;
let phone, contact;
const surface = vue.ref(null);
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h('section', { ref: surface }, [vue.h(Contact, { ref: value => (contact = value) }), vue.h(Cleanup)]);
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick(),
  click = (selector, text) => {
    const el = [...document.querySelectorAll(selector)].find(el => el.textContent.includes(text));
    assert(el, 'missing ' + text);
    el.click();
  };
(async () => {
  await phone.synchronize();
  await tick();
  const key = phone.activeIdentity.charKey;
  assert.equal(phone.activeThread.messages.length, 1);
  const other = phone.addContact('Bob', '朋友');
  phone.state.threads[Object.keys(phone.state.threads).find(id => phone.state.threads[id].charKey === other)].draft =
    '保留草稿';
  phone.startConversation(key);
  await tick();
  document.querySelector('.contact-settings .wave-select-trigger').click();
  await tick();
  click('[role=option]', 'NPC');
  await tick();
  const profile = document.querySelector('[aria-label="NPC 人设"]');
  assert(profile);
  profile.value = 'NPC-PROFILE-ONLY';
  profile.dispatchEvent(new Event('change', { bubbles: true }));
  profile.dispatchEvent(new Event('input', { bubbles: true }));
  profile.dispatchEvent(new Event('change', { bubbles: true }));
  click('.contact-relationship-options button', '朋友');
  assert.equal(contact.save(), true);
  await phone.synchronize();
  assert.equal(phone.activeIdentity.actorType, 'npc');
  assert.equal(phone.activeIdentity.npcProfile, 'NPC-PROFILE-ONLY');
  click('.chat-cleanup > button', '清空聊天记录');
  await tick();
  assert(surface.value.contains(document.querySelector('[role=dialog]')));
  click('.chat-clear-dialog button', '取消');
  await tick();
  assert.equal(phone.activeThread.messages.length, 1);
  await phone.clearActiveConversation('display');
  await phone.synchronize();
  assert.equal(phone.activeThread.messages.length, 0);
  assert(phoneHistory(phone.activeThread).some(message => message.content === 'OLD-FLOOR'));
  assert.equal(
    require(base + '/services/apps/memo.ts')
      .parseMemoData(phone.activeSnapshot.memo)
      .notes.map(n => n.content)
      .join('\n'),
    '保留备忘',
  );
  const input = () => ({
    cardKey: 'x',
    chatKey: 'test',
    cardName: 'Alice',
    identity: phone.activeIdentity,
    thread: phone.activeThread,
    appSnapshot: phone.activeSnapshot,
    availableStickers: '',
  });
  assert(buildPhonePrompts(input()).some(prompt => prompt.content?.includes('NPC-PROFILE-ONLY')));
  assert(buildPhonePrompts(input()).some(prompt => prompt.content?.includes('OLD-FLOOR')));
  floors.push({ message_id: 1, role: 'assistant', message: delta('NEW-FLOOR') });
  await phone.synchronize();
  assert.equal(phone.activeThread.messages.length, 1);
  assert.equal(phone.activeThread.messages[0].content, 'NEW-FLOOR');
  await phone.clearActiveConversation('context');
  await phone.synchronize();
  assert.equal(phoneHistory(phone.activeThread).length, 0);
  assert.equal(phone.activeThread.messages.length, 0);
  assert(
    !buildPhonePrompts(input()).some(
      prompt => prompt.content?.includes('OLD-FLOOR') || prompt.content?.includes('NEW-FLOOR'),
    ),
  );
  assert.equal(buildChatReference(phone.state), '');
  assert.equal(phone.activeIdentity.npcProfile, 'NPC-PROFILE-ONLY');
  assert.equal(
    require(base + '/services/apps/memo.ts')
      .parseMemoData(phone.activeSnapshot.memo)
      .notes.map(n => n.content)
      .join('\n'),
    '保留备忘',
  );
  floors.push({ message_id: 2, role: 'user', message: 'POST-CLEAR-CONTEXT' });
  const context = await prepareContext(phone.settings, phone.activeThread.historyFloorCutoff);
  assert.deepEqual(
    context.chat_history.prompts.map(p => p.content),
    ['POST-CLEAR-CONTEXT'],
  );
  assert(Object.values(phone.state.threads).some(thread => thread.charKey === other && thread.draft === '保留草稿'));

  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://test.invalid/v1';
  phone.settings.api.model = 'test';
  phone.settings.sendMode = 'secondary_api';
  let release, entered;
  const started = new Promise(resolve => (entered = resolve)),
    pending = new Promise(resolve => (release = resolve));
  global.stopGenerationById = async () => true;
  global.generateRaw = async () => {
    entered();
    await pending;
    return JSON.stringify({
      thread_id: phone.activeThread.id,
      messages: [{ sender: 'char', type: 'text', content: 'LATE-REPLY', payload: {} }],
      app_updates: {},
    });
  };
  const sending = phone.sendMessage('等待回复', true).catch(() => {});
  await started;
  await phone.clearActiveConversation('context');
  release();
  await sending;
  assert.equal(phone.activeThread.messages.length, 0);
  assert.equal(phoneHistory(phone.activeThread).length, 0);
  app.unmount();
  console.log(
    'PASS: clear confirmation cancellation, display-only archive, no replay, context erasure and new-floor cutoff, NPC identity persistence, retained other data.',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
