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
  SillyTavern: { name1: 'User', getCurrentChatId: () => chatId, characterId: '1' },
  getCharData: () => ({ name: 'Alice', description: '角色卡描述：喜欢旅行。' }),
  getWorldbookNames: () => ['其他世界书', '角色设定'],
  getCharWorldbookNames: () => ({ primary: '角色设定', additional: [] }),
  getWorldbook: async () => [{ uid: 7, name: 'Dora', content: '世界书角色资料'.repeat(200) }],
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');

const { usePhoneStore } = require(base + '/stores/phone.ts');
require('pinia').setActivePinia(createPinia());
const phone = usePhoneStore();
phone.settings.basic.cacheEnabled = false;
const GroupSettings = require(base + '/components/chat/WaveGroupSettings.vue').default;
const { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const { actorContext } = require(base + '/services/chat/chat-history.ts');
const surface = vue.ref(null);
const app = vue.createApp({
  setup() {
    vue.provide(phoneSurfaceKey, surface);
    return () => vue.h('section', { ref: surface }, [vue.h(GroupSettings)]);
  },
});
app.use(require('pinia').getActivePinia());
const tick = async () => {
  await vue.nextTick();
  await new Promise(resolve => setTimeout(resolve, 0));
  await vue.nextTick();
};
(async () => {
  await phone.synchronize();
  const alice = phone.activeIdentity.charKey,
    bob = phone.addContact('Bob', 'Friend');
  const group = phone.createGroup('141', [alice, bob], { observer: true });
  phone.startConversation(group);
  const clara = phone.addContact('Clara', 'Friend'),
    dora = phone.addContact('Dora', 'Friend');
  phone.startConversation(group);
  phone.activeThread.draft = 'Keep this draft';
  assert(phone.activeIdentity.groupObserver);
  const owner = phone.activeIdentity.groupOwnerKey;
  app.mount('#app');
  await tick();
  document.querySelector('.group-add-button').click();
  await tick();
  assert(document.querySelector('[aria-label="添加群成员"]'));
  assert.equal(document.querySelectorAll('.group-member-choice').length, 2, 'existing members excluded');
  for (const input of document.querySelectorAll('.group-member-choice input')) {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
  }
  await tick();
  document.querySelector('.group-edit-primary').click();
  await tick();
  assert(!document.querySelector('[aria-label="添加群成员"]'));
  assert(phone.activeIdentity.memberKeys.includes(clara));
  assert(phone.activeIdentity.memberKeys.includes(dora));
  assert(phone.activeIdentity.groupObserver);
  assert.equal(phone.activeIdentity.groupOwnerKey, owner);
  assert(!phone.activeIdentity.groupMembers.user);
  assert.equal(phone.activeIdentity.groupMembers[clara].level, 1);
  assert.equal(phone.activeThread.draft, 'Keep this draft');
  const notices = phone.activeThread.messages.filter(m => m.payload.action === 'add');
  assert.equal(notices.length, 2);
  assert(notices.every(m => m.payload.actorKey === 'system'));
  assert.equal(phone.addGroupMembers([clara, clara], group), 0);
  assert.equal(phone.activeThread.messages.filter(m => m.payload.action === 'add').length, 2);
  assert.throws(() => phone.addGroupMembers(['missing'], group));
  await phone.synchronize();
  assert(phone.activeIdentity.memberKeys.includes(clara));
  assert(phone.activeIdentity.groupObserver);
  const { contactPrompt } = require(base + '/services/generation/narrative-context.ts');
  const prompt = contactPrompt(
    phone.activeIdentity,
    phone.activeIdentity.memberKeys.map(key => phone.state.identities[key]),
  );
  assert(prompt.includes(clara));
  assert(prompt.includes('User 不在本群'));
  phone.activeThread.generating = true;
  assert.throws(() => phone.addGroupMembers([alice], group), /回复结束/);
  phone.activeThread.generating = false;
  document.querySelector('.group-add-button').click();
  await tick();
  assert(document.body.textContent.includes('暂无可添加'));
  phone.selectIdentity(alice);
  await tick();
  assert(!document.querySelector('[aria-label="添加群成员"]'));
  console.log(
    'PASS observer member picker, multi-select, roles, no user join, notifications, duplicate protection, persistence and AI roster',
  );
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.unmount());
