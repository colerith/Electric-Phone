const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
global.window = global;
global.toastr = { info: () => {} };
let chat = 'test-chat',
  vars = { script: {}, chat: {} },
  floors = [];
global.SillyTavern = { name1: 'User', getCurrentChatId: () => chat, characterId: '1', groupId: '', characters: [] };
global.getCharData = () => ({ name: 'Alice', avatar: 'a.png' });
global.getCharAvatarPath = () => '/a.png';
global.getVariables = ({ type }) => vars[type];
global.replaceVariables = (v, { type }) => {
  vars[type] = v;
};
global.getChatMessages = range => (typeof range === 'number' ? floors.filter(m => m.message_id === range) : floors);
global.stopGenerationById = async () => true;
let rules = [];
global.getTavernRegexes = () => rules;
global.updateTavernRegexesWith = async fn => (rules = fn(rules));
const base = path.resolve(__dirname, '..');
const { createPinia, setActivePinia } = require('pinia');
setActivePinia(createPinia());
const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const store = usePhoneStore();
store.settings.basic.cacheEnabled = false;

(async () => {
  await store.synchronize();
  const a = store.state.activeCharKey,
    b = store.addContact('Bob', 'Friend');
  const group = store.createGroup('Group', [a, b]);
  const { PhoneMessageSchema } = require(base + '/schemas.ts');
  for (const key of [a, b, group]) {
    store.selectIdentity(key);
    store.activeThread.messages.push(
      PhoneMessageSchema.parse({ id: key, sender: 'char', content: key, status: 'sent', createdAt: '2026-10-12T00:00:00Z' }),
    );
  }
  store.saveMusicLibrary();
  store.selectIdentity(a);
  const targetId = store.activeThread.id;
  store.selectIdentity(b);
  await assert.rejects(store.clearActiveConversation('context', targetId), /窗口已切换/);
  assert.equal(store.activeThread.messages.length, 1);
  store.selectIdentity(a);
  await store.clearActiveConversation('display', targetId);
  assert.equal(store.activeThread.messages.length, 0);
  assert.equal(store.activeThread.historyArchive.length, 1);
  for (const key of [b, group]) {
    store.selectIdentity(key);
    assert.equal(store.activeThread.messages.length, 1);
  }
  await store.clearActiveConversation('context', store.activeThread.id);
  assert.equal(store.activeThread.messages.length, 0);
  assert.equal(store.activeThread.historyArchive.length, 0);
  store.selectIdentity(b);
  assert.equal(store.activeThread.messages.length, 1);
  await store.synchronize();
  store.selectIdentity(b);
  assert.equal(store.activeThread.messages.length, 1);
  console.log('PASS: clear targets only one private/group thread, preserves peers and rejects switched confirmation');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
