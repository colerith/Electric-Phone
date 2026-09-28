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
const { usePhoneStore } = require(base + '/stores/phone.ts'),
  Messenger = require(base + '/components/chat/WaveMessenger.vue').default,
  Generation = require(base + '/components/settings/WaveGenerationSettings.vue').default,
  { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const { chooseFollowModules } = require(base + '/services/generation/follow-generation.ts'),
  { buildChatReference, resolveNarrativeRelation } = require(base + '/services/generation/narrative-context.ts');
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
  assert.equal(document.querySelectorAll('.messenger-row').length, 1);
  assert(!document.body.textContent.includes('私聊讯号'));
  assert(!document.body.textContent.includes('立即生成所选模块'));
  const alice = phone.activeIdentity.charKey;
  const bob = phone.addContact('Bob', '朋友');
  await phone.synchronize();
  assert.equal(phone.state.identities[bob].source, 'local_contact');
  assert.equal(phone.state.mode, 'single');
  phone.startConversation(bob);
  await tick();
  assert.equal(document.querySelectorAll('.messenger-swipe-row').length, 2);
  document.querySelector('.messenger-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  await tick();
  assert(document.querySelector('.revealed'));
  document.querySelector('.revealed .messenger-row-actions button').click();
  await tick();
  assert(Object.values(phone.state.threads).some(thread => thread.pinned));
  phone.removeConversation(bob);
  await phone.synchronize();
  assert.equal(Object.values(phone.state.threads).find(t => t.charKey === bob).hidden, true);
  phone.startConversation(bob);
  assert.equal(phone.activeThread.hidden, false);
  component.toggleMenu();
  await tick();
  assert.equal(document.querySelectorAll('[role=menuitem]').length, 5);
  clickText('[role=menuitem]', '添加好友');
  await tick();
  assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-label'), '添加好友');
  assert(surface.value.contains(document.querySelector('[role=dialog]')));
  const input = document.querySelector('[role=dialog] input');
  input.value = 'Clara';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  clickText('[role=dialog] button', '添加好友');
  await tick();
  assert(phone.identities.some(i => i.name === 'Clara'));
  const clara = phone.identities.find(i => i.name === 'Clara');
  const claraRow = [...document.querySelectorAll('.contact-swipe-row')].find(row => row.textContent.includes('Clara'));
  assert(claraRow);
  claraRow.querySelector('.messenger-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  await tick();
  claraRow.querySelector('.messenger-row-actions button').click();
  await tick();
  assert(!phone.state.identities[clara.charKey]);
  assert(phone.state.deletedCharKeys.includes(clara.charKey));
  component.toggleMenu();
  await tick();
  clickText('[role=menuitem]', '创建群聊');
  await tick();
  const choices = [...document.querySelectorAll('.messenger-group-picker [role=checkbox]')];
  assert(choices.length >= 2);
  assert.equal(choices[0].getAttribute('aria-checked'), 'false');
  choices[0].click();
  await tick();
  assert(choices[0].classList.contains('is-selected'));
  assert.equal(choices[0].getAttribute('aria-checked'), 'true');
  assert(choices[0].querySelector('.messenger-member-check .fa-check'));
  assert(document.querySelector('.messenger-dialog .settings-save-wide').disabled);
  choices[1].click();
  await tick();
  assert(!document.querySelector('.messenger-dialog .settings-save-wide').disabled);
  if (process.env.WAVE_QA_GROUP_HTML)
    fs.writeFileSync(process.env.WAVE_QA_GROUP_HTML, document.querySelector('.messenger-dialog').outerHTML);
  document.querySelector('[aria-label="关闭"]').click();
  await tick();
  const group = phone.createGroup('一起聊天', [alice, bob]);
  phone.startConversation(group);
  await phone.synchronize();
  assert.equal(phone.activeIdentity.source, 'local_group');
  assert.deepEqual([...phone.activeIdentity.memberKeys], [alice, bob]);
  assert.equal(phone.state.mode, 'single');
  phone.settings.generation.followEnabled = true;
  phone.settings.generation.requiredModules = ['status'];
  phone.settings.generation.modules = ['status', 'memo'];
  phone.settings.generation.probability = 0;
  assert.deepEqual(
    chooseFollowModules(phone.settings.generation, () => 0),
    ['status'],
  );
  phone.settings.generation.probability = 100;
  assert.deepEqual(
    chooseFollowModules(phone.settings.generation, () => 0),
    ['status', 'memo'],
  );
  await tick();
  const randomButtons = document.querySelectorAll('.generation-module-group')[1].querySelectorAll('button');
  [...randomButtons].find(button => button.textContent.includes('状态')).click();
  await tick(); // preexisting duplicate toggles off random
  [...randomButtons].find(button => button.textContent.includes('状态')).click();
  await tick();
  assert(!phone.settings.generation.requiredModules.includes('status'));
  assert(phone.settings.generation.modules.includes('status'));
  phone.activeThread.messages.push({
    id: 'x',
    clientId: '',
    sender: 'char',
    type: 'text',
    content: '周末再聊',
    createdAt: new Date().toISOString(),
    status: 'sent',
    payload: { narrativeRelation: 'independent' },
    withdrawn: false,
  });
  assert(buildChatReference(phone.state).includes('独立聊天参考'));
  phone.activeThread.messages[0].payload.waveFloor = true;
  assert(buildChatReference(phone.state).includes('酒馆跟随生成'));
  assert.equal(resolveNarrativeRelation('auto', 'linked'), 'linked');
  assert.equal(resolveNarrativeRelation('auto'), 'independent');
  phone.activeThread.hidden = true;
  assert.equal(buildChatReference(phone.state), '');
  phone.activeThread.hidden = false;
  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://test.invalid/v1';
  phone.settings.api.model = 'test';
  phone.settings.generation.narrativeMode = 'independent';
  phone.settings.sendMode = 'secondary_api';
  global.generateRaw = async args => {
    assert(!args.ordered_prompts.includes('chat_history'));
    assert(args.user_input.includes('群聊'));
    return (
      '<electric>演示记录 {not json}</electric>' +
      JSON.stringify({
        context_relation: 'linked',
        thread_id: phone.activeThread.id,
        messages: [{ sender: 'char', type: 'text', content: '大家晚上好', payload: { actorKey: alice } }],
        app_updates: {},
      })
    );
  };
  await phone.sendMessage('群里晚上好', true);
  assert.equal(phone.activeThread.messages.at(-1).content, '大家晚上好');
  assert.equal(phone.activeThread.messages.at(-1).payload.electric, '演示记录 {not json}');
  assert.equal(phone.activeThread.messages.at(-1).payload.narrativeRelation, 'independent');
  assert.equal(phone.activeThread.messages.at(-1).payload.actorKey, alice);
  const beforeCount = phone.activeThread.messages.filter(message => message.sender === 'char').length;
  global.generateRaw = async () =>
    JSON.stringify({
      thread_id: phone.activeThread.id,
      messages: [{ sender: 'char', content: '错误成员', payload: { actorKey: 'unknown' } }],
      app_updates: {},
    });
  await assert.rejects(phone.sendMessage('再聊一句', true), /成员标识/);
  assert.equal(phone.activeThread.messages.filter(message => message.sender === 'char').length, beforeCount);
  assert(phone.activeThread.messages.some(message => message.status === 'failed'));

  component.toggleMenu();
  await tick();
  clickText('[role=menuitem]', '从角色卡描述导入');
  await tick();
  assert.equal(document.querySelector('[role=dialog] input').value, 'Alice');
  assert.equal(document.querySelector('[role=dialog] textarea').value, '角色卡描述：喜欢旅行。');
  clickText('[role=dialog] button', '导入角色');
  await tick();
  await phone.synchronize();
  assert.equal(phone.state.identities[alice].about, '角色卡描述：喜欢旅行。');
  assert.equal(phone.identities.filter(identity => identity.name === 'Alice').length, 1);

  // Exercise the worldbook import through the real Vue dialog.
  component.toggleMenu();
  await tick();
  clickText('[role=menuitem]', '从世界书导入角色');
  await tick();
  const bookSelect = document.querySelector('[role=dialog] select');
  assert.equal(bookSelect.value, '角色设定', 'bound character worldbook is selected by default');
  assert.equal(bookSelect.options[1].value, '角色设定');
  assert([...bookSelect.options].some(option => option.value === '其他世界书'));
  bookSelect.value = '其他世界书';
  bookSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  await tick();
  const entrySelect = document.querySelectorAll('[role=dialog] select')[1];
  entrySelect.value = '7';
  entrySelect.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert.equal(document.querySelector('[role=dialog] input').value, 'Dora');
  clickText('[role=dialog] button', '导入角色');
  await tick();
  const imported = phone.identities.find(identity => identity.name === 'Dora');
  assert.equal(imported.about, '世界书角色资料'.repeat(200));
  phone.selectIdentity(bob);
  phone.updateActiveIdentityProfile({ remark: '老朋友', avatar: 'custom.png', avatarZoom: 1.5 });
  phone.setContactDetails({ actorType: 'npc', npcProfile: '保留的角色资料', relationshipToUser: '朋友' });
  phone.startConversation(bob);
  await phone.sendMessage('只属于旧聊天', false);
  const oldChat = structuredClone(vars.chat);
  chatId = 'new-chat';
  vars.chat = {};
  await phone.synchronize();
  assert.equal(phone.state.identities[bob].remark, '老朋友');
  assert.equal(phone.state.identities[bob].avatar, 'custom.png');
  assert.equal(phone.state.identities[bob].npcProfile, '保留的角色资料');
  assert.equal(phone.state.identities[imported.charKey].about, imported.about);
  assert.equal(phone.state.identities[alice].about, '角色卡描述：喜欢旅行。');
  assert(!phone.state.identities[clara.charKey], 'deleted contacts must not return');
  assert(
    Object.values(phone.state.threads).every(thread => !thread.messages.length),
    'new chat starts with empty records',
  );
  chatId = 'test';
  vars.chat = oldChat;
  await phone.synchronize();
  assert(
    Object.values(phone.state.threads).some(thread =>
      thread.messages.some(message => message.content === '只属于旧聊天'),
    ),
  );

  clickText('.messenger-dock button', '我的');
  await tick();
  assert.equal(component.headerIcon, '');
  for (const [label, title] of [['编辑资料', '编辑资料']]) {
    clickText('.moments-me-menu button', label);
    await tick();
    assert.equal(component.headerTitle, title);
    assert(!document.querySelector('.messenger-bottom'));
    assert(!document.querySelector('.moments-subheading'));
    assert.equal(component.handleBack(), true);
    await tick();
    assert.equal(component.headerTitle, '我的');
    assert(document.querySelector('.messenger-dock'));
  }
  app.unmount();
  console.log(
    'PASS: actual Vue messenger menu/dialog, contacts, persistent pin/remove/reopen, local groups across sync, module mutual exclusivity and required/random selection, narrative provenance.',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
