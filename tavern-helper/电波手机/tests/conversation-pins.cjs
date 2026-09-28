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
let chat = 'pin-test',
  vars = { global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', characterId: '1', getCurrentChatId: () => chat },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (value, { type }) => (vars[type] = value),
});
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { createPinia, setActivePinia } = require('pinia');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const { PROFILE_VARIABLE_KEY } = require(base + '/schemas.ts');
const cache = require(base + '/services/core/local-cache.ts');
const make = () => {
  setActivePinia(createPinia());
  const phone = usePhoneStore();
  phone.settings.basic.cacheEnabled = false;
  return phone;
};
(async () => {
  let phone = make();
  await phone.synchronize();
  const key = phone.activeIdentity.charKey;
  phone.setConversationPinned(key);
  assert(phone.activeThread.pinned);
  phone = make();
  await phone.synchronize();
  assert(phone.activeThread.pinned, 'reload after script update keeps pin');
  const saved = vars.chat.wave_phone_chat.threads;
  const old = phone.activeThread.id;
  saved['old-version-thread'] = { ...saved[old], id: 'old-version-thread', pinned: true };
  delete saved[old];
  phone = make();
  await phone.synchronize();
  assert(phone.activeThread.pinned);
  assert(!phone.state.threads['old-version-thread']);
  // Simulate rebuilding a thread from stored identities while its shared settings survive.
  vars.chat.wave_phone_chat.threads = {};
  phone = make();
  await phone.synchronize();
  assert(phone.activeThread.pinned);
  let release;
  cache.cachedParse = () => new Promise(resolve => (release = resolve));
  phone.settings.basic.cacheEnabled = true;
  const pending = phone.synchronize();
  assert(release);
  phone.setConversationPinned(key);
  assert.equal(phone.activeThread.pinned, false);
  release([]);
  await pending;
  assert.equal(phone.activeThread.pinned, false, 'stale async sync cannot overwrite unpin');
  phone = make();
  await phone.synchronize();
  assert.equal(phone.activeThread.pinned, false, 'explicit unpin survives reload');
  delete vars.global[PROFILE_VARIABLE_KEY].data[`character:1::${key}`].conversationPinned;
  vars.chat.wave_phone_chat.threads[phone.activeThread.id].pinned = true;
  phone = make();
  await phone.synchronize();
  assert.equal(
    vars.global[PROFILE_VARIABLE_KEY].data[`character:1::${key}`].conversationPinned,
    true,
    'legacy pin is migrated',
  );
  console.log(
    'PASS: pin persistence across updates, legacy thread IDs, reconstructed threads, unpin and asynchronous sync.',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
