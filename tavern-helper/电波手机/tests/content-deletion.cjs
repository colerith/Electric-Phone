const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');

require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );
global._ = require('lodash');
global.z = require('zod').z;
global.window = global;
global.toastr = { info: () => {} };

let variables = { script: {}, chat: {} },
  floors = [];
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => 'deletion-test', characterId: '1', groupId: '' },
  getCharData: () => ({ name: 'Alice', avatar: 'alice.png' }),
  getCharAvatarPath: () => '/alice.png',
  getVariables: ({ type }) => variables[type],
  replaceVariables: (value, { type }) => (variables[type] = value),
  getChatMessages: range => (typeof range === 'number' ? floors.filter(item => item.message_id === range) : floors),
  getTavernRegexes: () => [],
  updateTavernRegexesWith: async () => {},
});

const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { createPinia, setActivePinia } = require('pinia');
setActivePinia(createPinia());
const { serializeDelta } = require(base + '/services/module-protocol.ts');
const { parseMemoData } = require(base + '/services/memo.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const phone = usePhoneStore();
phone.settings.basic.cacheEnabled = false;

const delta = content => ({
  version: 1,
  char_id: 'alice',
  char_name: 'Alice',
  messages: [],
  app_updates: { memo: { notes: [{ id: 'memo-1', title: '计划', content }], doodles: [] } },
});

(async () => {
  floors = [{ message_id: 1, role: 'assistant', message: serializeDelta(delta('会从历史楼层同步')) }];
  await phone.synchronize();
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 1);

  phone.deleteSnapshotItem('memo', 'note', 'memo-1');
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 0);
  await phone.synchronize();
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 0, '单项删除不应被旧楼层恢复');

  phone.clearAppContent('memo');
  await phone.synchronize();
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 0, '一键清空后应屏蔽此前楼层');

  floors.push({ message_id: 2, role: 'assistant', message: serializeDelta(delta('清空后生成的新内容')) });
  await phone.synchronize();
  assert.equal(parseMemoData(phone.activeSnapshot.memo).notes.length, 0, '同 ID 的已删除项目仍应保持隐藏');

  floors.push({
    message_id: 3,
    role: 'assistant',
    message: serializeDelta({
      ...delta(''),
      app_updates: { memo: { notes: [{ id: 'memo-2', title: '新计划', content: '真正的新内容' }], doodles: [] } },
    }),
  });
  await phone.synchronize();
  assert.deepEqual(
    parseMemoData(phone.activeSnapshot.memo).notes.map(item => item.id),
    ['memo-2'],
  );
  console.log(
    'PASS: item tombstones and app floor cutoffs prevent deleted content from returning while allowing new data.',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
