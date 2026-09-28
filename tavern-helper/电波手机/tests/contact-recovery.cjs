const fs = require('node:fs'),
  path = require('node:path'),
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
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const schema = require(base + '/schemas.ts');
const { diagnostics } = require(base + '/services/core/diagnostics.ts');
const { describeRequestError } = require(base + '/services/core/request-error.ts');
const { validatePhoneBlocks } = require(base + '/services/generation/parser.ts');
const { cachedParse } = require(base + '/services/core/local-cache.ts');
const { generatePhoneReply, testSecondaryApi } = require(base + '/services/generation/generation.ts');
let chat = 'one',
  vars = { global: {}, script: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chat, characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
  stopGenerationById: async () => true,
});
async function run() {
  const { createPinia, setActivePinia } = require('pinia');
  setActivePinia(createPinia());
  const phone = require(base + '/stores/phone.ts').usePhoneStore();
  phone.settings.basic.cacheEnabled = false;
  await phone.synchronize();
  const original = phone.activeIdentity.charKey;
  const duplicate = phone.addContact('Duplicate', '');
  phone.state.identities[duplicate].stableId = phone.activeIdentity.stableId;
  phone.deleteContact(duplicate);
  await phone.synchronize();
  assert(phone.isReady, phone.syncError);
  assert(phone.state.identities[original], 'deleting an alias must retain the real character');
  // Repair a legacy tombstone that used to delete both contacts.
  vars.chat.wave_phone_chat.deletedCharKeys.push(phone.activeIdentity.stableId);
  await phone.synchronize();
  assert(phone.activeIdentity);
  assert(phone.activeThread);
  // Deleting the last character must not leave an unusable phone on reopening.
  phone.deleteContact(phone.activeIdentity.charKey);
  await phone.synchronize();
  assert(phone.isReady, phone.syncError);
  assert(phone.activeThread);
  // Simulate an interrupted browser session saved by an older release.
  vars.chat.wave_phone_chat.threads[phone.activeThread.id].generating = true;
  vars.chat.wave_phone_chat.threads[phone.activeThread.id].generationId = 'dead-request';
  await phone.synchronize();
  assert.equal(phone.activeThread.generating, false);
  await phone.sendMessage('恢复后可发送', false);
  assert.equal(phone.activeThread.messages.at(-1).content, '恢复后可发送');
  // A concurrent sync must not replace live thread objects or strand the send lock.
  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://test.invalid/v1';
  phone.settings.api.model = 'test';
  phone.settings.sendMode = 'secondary_api';
  let resolveReply;
  global.generateRaw = () =>
    new Promise(resolve => {
      resolveReply = resolve;
    });
  const sending = phone.sendMessage('等待回复', true);
  while (!resolveReply) await new Promise(resolve => setImmediate(resolve));
  const liveThread = phone.activeThread;
  assert(liveThread.generating);
  assert.equal(vars.chat.wave_phone_chat.threads[liveThread.id].generating, false);
  await phone.synchronize();
  assert.equal(phone.activeThread, liveThread);
  resolveReply(
    JSON.stringify({ thread_id: liveThread.id, messages: [{ sender: 'char', content: '收到' }], app_updates: {} }),
  );
  await sending;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(phone.activeThread.generating, false);
  assert(phone.activeThread.messages.some(message => message.content === '收到'));
  // Stop and discard a late reply without relocking the conversation.
  resolveReply = undefined;
  const stopped = phone.sendMessage('停止这个请求', true);
  const stoppedResult = assert.rejects(stopped, /已取消|停止/);
  while (!resolveReply) await new Promise(resolve => setImmediate(resolve));
  await phone.stopActiveGeneration();
  await phone.sendMessage('停止后可以继续发', false);
  resolveReply(
    JSON.stringify({
      thread_id: phone.activeThread.id,
      messages: [{ sender: 'char', content: '迟到结果' }],
      app_updates: {},
    }),
  );
  await stoppedResult;
  assert(!phone.activeThread.messages.some(message => message.content === '迟到结果'));
  assert.equal(phone.activeThread.generating, false);
  phone.dispose();
  console.log(
    'PASS: duplicate deletion, legacy tombstones, last-contact recovery, stale generation locks, sync during generation, cancellation and late-result isolation.',
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
