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
(async () => {
  await phone.synchronize();
  const alice = phone.activeIdentity.charKey,
    bob = phone.addContact('Bob', '朋友');
  const group = phone.createGroup('测试群', [alice, bob]);
  assert.equal(phone.state.identities[group].groupObserver, true, '两位联系人强制仅围观');
  assert.notEqual(phone.state.identities[group].groupOwnerKey, 'user');
  // Existing three-person groups remain joined; exercise their unchanged management behavior.
  phone.state.identities[group].groupObserver = false;
  phone.state.identities[group].groupOwnerKey = 'user';
  phone.startConversation(group);
  phone.currentPage = 'conversation';
  const notices = () => phone.activeThread.messages.filter(m => m.payload.interaction === 'group_management');
  phone.activeThread.draft = '未发送的草稿';
  phone.updateGroupDetails({ name: '新群名', announcement: '第一条公告\n第二行' });
  assert.deepEqual(
    notices().map(m => m.payload.action),
    ['name', 'announcement'],
  );
  assert(notices()[1].content.includes('第一条公告\n第二行'));
  phone.updateGroupDetails({ name: '新群名', announcement: '第一条公告\n第二行' });
  assert.equal(notices().length, 2, '相同值不重复通知');
  phone.updateGroupMember(bob, { nickname: '小波', title: '闪光', admin: true, muted: true });
  assert.deepEqual(
    notices()
      .slice(-4)
      .map(m => m.payload.action),
    ['nickname', 'title', 'admin', 'muted'],
  );
  phone.updateGroupMember(bob, { nickname: '小波', title: '闪光', admin: true, muted: true });
  assert.equal(notices().length, 6);
  phone.updateGroupMember(bob, { nickname: '', title: '', admin: false, muted: false });
  assert(notices().at(-1).content.includes('解除了'));
  assert(notices().at(-2).content.includes('取消了'));
  assert.equal(phone.activeThread.draft, '未发送的草稿');
  const ids = notices().map(m => m.id);
  await phone.synchronize();
  assert.deepEqual(
    notices().map(m => m.id),
    ids,
    '同步后保持本地通知且不重复',
  );
  phone.updateGroupDetails({ announcement: '' });
  assert(notices().at(-1).content.includes('清空了群公告'));
  phone.updateActiveIdentityProfile({ avatar: 'https://example.com/group.png', avatarZoom: 1.3 });
  assert.equal(notices().at(-1).payload.action, 'avatar');
  phone.updateGroupMember(alice, { remove: true });
  assert(notices().at(-1).content.includes('Alice'));
  assert(!phone.activeIdentity.memberKeys.includes(alice));
  phone.updateGroupMember(bob, { transferOwner: true });
  assert.equal(notices().at(-1).payload.action, 'owner');
  const count = notices().length;
  assert.throws(() => phone.updateGroupMember(bob, { admin: true }));
  assert.throws(() => phone.updateGroupMember(bob, { muted: true }));
  phone.updateGroupDetails({ announcement: '无权限' });
  assert.equal(notices().length, count, '无权限操作不能产生成功通知');
  assert(notices().every(m => m.sender === 'system' && m.type === 'system' && m.status === 'sent'));
  assert.equal(new Set(notices().map(m => m.id)).size, count);
  phone.selectIdentity(alice);
  assert(!phone.activeThread.messages.some(m => m.payload.interaction === 'group_management'));
  console.log(
    'PASS: group change notices, unchanged/denied actions, draft preservation, group isolation and sync persistence.',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
