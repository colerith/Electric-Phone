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
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { createPinia, setActivePinia } = require('pinia');
setActivePinia(createPinia());
const { serializeDelta } = require(base + '/services/module-protocol.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const store = usePhoneStore();
store.settings.basic.cacheEnabled = false;
const delta = {
  version: 1,
  char_id: 'character:1',
  char_name: 'Alice',
  messages: [
    {
      sender: 'char',
      type: 'system',
      content: '拍一拍',
      payload: { interaction: 'poke', actorName: 'Alice', targetName: 'User' },
    },
  ],
  app_updates: { memo: '新增备忘' },
};
(async () => {
  floors = [{ message_id: 1, role: 'assistant', message: serializeDelta(delta) }];
  await store.synchronize();
  assert.equal(store.syncError, '');
  assert.equal(store.activeThread.messages.length, 1);
  assert.equal(
    require(base + '/services/memo.ts')
      .parseMemoData(store.activeSnapshot.memo)
      .notes.map(n => n.content)
      .join('\n'),
    '新增备忘',
  );
  await store.synchronize();
  assert.equal(store.activeThread.messages.length, 1);
  store.settings.basic.autoOpenOnUpdate = true;
  floors[0].message = serializeDelta({
    ...delta,
    messages: [{ ...delta.messages[0], content: '新版拍一拍' }],
    app_updates: { memo: '新版备忘' },
  });
  await store.synchronize();
  assert.equal(store.activeThread.messages.length, 1);
  assert.equal(store.activeThread.messages[0].content, '新版拍一拍');
  assert(store.unreadApps.includes('messages'));
  assert(store.unreadApps.includes('memo'));
  assert.equal(store.isOpen, true);
  store.markAppRead('memo');
  assert(!store.unreadApps.includes('memo'));
  assert.equal(
    require(base + '/services/memo.ts')
      .parseMemoData(store.activeSnapshot.memo)
      .notes.map(n => n.content)
      .join('\n'),
    '新版备忘',
  );
  floors = [];
  await store.synchronize();
  assert.equal(store.activeThread.messages.length, 0);
  assert.equal(store.activeSnapshot.memo, '');
  store.settings.api.enabled = true;
  store.settings.api.apiurl = 'https://test.invalid/v1';
  store.settings.api.model = 'test';
  store.settings.api.key = 'test';
  store.settings.api.apiKey = 'test';
  store.settings.api.maxRetries = 0;
  global.generateRaw = async args => {
    assert(args.ordered_prompts.some(p => typeof p === 'object' && p.content.includes('本轮仅允许更新：memo')));
    return JSON.stringify({ ...delta, messages: [], app_updates: { memo: '手动结果' } });
  };
  global.createChatMessages = async rows => {
    rows.forEach(row => floors.push({ ...row, message_id: floors.length + 1 }));
  };
  const result = await store.generateModule('memo');
  assert(result.includes('同步'));
  assert.equal(floors.length, 1);
  assert.equal(
    require(base + '/services/memo.ts')
      .parseMemoData(store.activeSnapshot.memo)
      .notes.map(n => n.content)
      .join('\n'),
    '手动结果',
  );
  assert(!floors[0].message.includes('wave-phone-card:start'));
  global.generateRaw = async () => {
    chat = 'other-chat';
    return JSON.stringify({ ...delta, messages: [], app_updates: { memo: '过期结果' } });
  };
  await assert.rejects(store.generateModule('memo'), /切换/);
  assert.equal(floors.length, 1);
  assert.equal(store.moduleGenerating, false);
  console.log(
    'PASS: real Pinia synchronization, repeat de-duplication, swipe replacement, deleted floor removal, manual module request and floor write-back, namespace switch rejection.',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
