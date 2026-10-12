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
  const group = store.createGroup('Observer group', [a, b], { observer: true });
  store.selectIdentity(group);
  const cache = require(base + '/services/core/local-cache.ts');
  let unblock, entered;
  const started = new Promise(resolve => (entered = resolve));
  cache.chatParseSignature = async () => 'test';
  cache.cachedParse = async () => {
    entered();
    await new Promise(resolve => (unblock = resolve));
    return [];
  };
  store.settings.basic.cacheEnabled = true;
  const syncing = store.synchronize();
  await started;
  require(base + '/services/generation/generation.ts').generatePhoneModule = async input => {
    input.onElectric('round context', 'Observer round');
    return {
      messages: [{ sender: 'char', type: 'text', content: 'Hello group', payload: { actorKey: a } }],
      app_updates: {},
    };
  };
  await store.generateModule('messages');
  unblock();
  await syncing;
  assert.equal(
    store.activeThread.messages.at(-1)?.content,
    'Hello group',
    'stale synchronization must not erase manual group replies',
  );
  const rounds = require(base + '/services/generation/electric.ts').groupRoundElectric(store.activeThread.messages);
  assert.equal(Object.values(rounds)[0]?.title, 'Observer round', 'ECOT belongs to generated group round');
  store.settings.basic.cacheEnabled = false;
  await store.synchronize();
  assert.equal(store.activeThread.messages.at(-1)?.content, 'Hello group');
  console.log('PASS: observer group messages survive synchronization with round-scoped ECOT');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
