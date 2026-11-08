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
const chatVars = {};
global.getVariables = ({ type }) => (type === 'chat' ? (chatVars[chat] ||= {}) : vars[type]);
global.replaceVariables = (v, { type }) => {
  if (type === 'chat') chatVars[chat] = v;
  else vars[type] = v;
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
  const selected = {
    ...store.state.moments.settings,
    autoUserInteractions: true,
    imageMode: 'ai',
    imageProfileId: 'image-service',
    maxImages: 4,
    heartbeatEnabled: false,
  };
  store.saveMomentSettings(selected);
  chat = 'new-chat';
  await store.synchronize();
  assert.equal(store.state.moments.settings.autoUserInteractions, true);
  assert.equal(store.state.moments.settings.maxImages, 4);
  assert.equal(store.state.moments.settings.imageProfileId, 'image-service');
  store.saveMomentSettings({ ...store.state.moments.settings, autoUserInteractions: false, maxImages: 0 });
  chat = 'test-chat';
  await store.synchronize();
  assert.equal(store.state.moments.settings.autoUserInteractions, false);
  assert.equal(store.state.moments.settings.maxImages, 0);
  const cache = require(base + '/services/core/local-cache.ts');
  let entered, unblock;
  const started = new Promise(resolve => (entered = resolve));
  cache.chatParseSignature = async () => 'space-test';
  cache.cachedParse = async () => {
    entered();
    await new Promise(resolve => (unblock = resolve));
    return [];
  };
  store.settings.basic.cacheEnabled = true;
  const syncing = store.synchronize();
  await started;
  store.saveMomentSettings({ ...store.state.moments.settings, cooldownMinutes: 77 });
  unblock();
  await syncing;
  assert.equal(store.state.moments.settings.cooldownMinutes, 77, 'in-flight sync keeps the latest settings');
  store.settings.basic.cacheEnabled = false;
  setActivePinia(createPinia());
  const reopened = usePhoneStore();
  reopened.settings.basic.cacheEnabled = false;
  await reopened.synchronize();
  assert.equal(reopened.state.moments.settings.maxImages, 0);
  global.getCharData = () => ({ name: 'Bob', avatar: 'b.png' });
  SillyTavern.characterId = '2';
  chat = 'other-card';
  await store.synchronize();
  assert.equal(store.state.moments.settings.imageMode, 'description');
  assert.equal(store.state.moments.settings.maxImages, 1);
  console.log('PASS: space settings persist across new and old chats, false/zero retained, cards isolated');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
