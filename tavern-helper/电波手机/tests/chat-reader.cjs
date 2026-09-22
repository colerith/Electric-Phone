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
global.SillyTavern = { chat: [] };
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { readChatFloors, readChatFloor, writeChatFloor } = require(base + '/services/chat/chat-reader.ts');
const { parsePhoneMessage } = require(base + '/services/generation/parser.ts');
const { parseStatusProfile } = require(base + '/services/apps/status.ts');
const delta = {
  version: 1,
  char_id: 'character:62',
  char_name: 'Ghost - 虎鲨鬼鬼',
  messages: [
    {
      client_id: 'gh_msg_01',
      sender: 'char',
      type: 'text',
      content: 'Tomorrow 3:00 PM. Not a single minute late.',
      created_at: '2025-11-10T20:46:00Z',
      payload: { translation: '明天下午三点整。一分钟都不许迟到。', translationProvider: '模型' },
    },
  ],
  app_updates: { status: { 角色名称: 'Simon', 好感指数: '14.2' } },
};
const text = '<wave_phone_delta>\n' + JSON.stringify(delta, null, 2) + '\n</wave_phone_delta>\n<snow>其他正文</snow>';
let calls = 0;
global.getChatMessages = () => {
  calls++;
  throw new TypeError("Cannot read properties of undefined (reading 'swipe_id')");
};
assert.deepEqual(readChatFloors(), []);
assert.equal(calls, 0);
SillyTavern.chat = [
  { name: 'User', is_user: true, mes: 'hello' },
  undefined,
  { name: 'Ghost', mes: text, swipes: ['未选旧消息', text], swipe_id: 1 },
  { name: 'hidden', mes: text, is_system: true },
];
const rows = readChatFloors({ role: 'assistant', hide_state: 'unhidden' });
assert.equal(rows.length, 1);
assert.equal(rows[0].message_id, 2);
assert.equal(rows[0].message, text);
assert.equal(
  parsePhoneMessage(rows[0].message, rows[0].message_id)[0].delta.messages[0].payload.translation,
  delta.messages[0].payload.translation,
);
const status = parseStatusProfile(
  JSON.stringify({
    角色名称: 'Simon',
    好感指数: '14.2',
    情绪气泡: '过载；嘴硬；暗涌',
    隐秘心声: '明天下午三点',
    性欲指数: '32',
  }),
);
assert.equal(status.name, 'Simon');
assert.equal(status.favor.value, 14.2);
assert.equal(status.desire.value, 32);
assert.deepEqual(status.moods, ['过载', '嘴硬', '暗涌']);
const compactStatus = parseStatusProfile(
  JSON.stringify({
    fav: 14.2,
    fav_delta: '+0.5',
    soc: 78,
    mood: ['心防失守', '极度别扭', '暗中准备'],
    hidden_thought: '她明天真的要来。',
  }),
);
assert.equal(compactStatus.favor.value, 14.2);
assert.equal(compactStatus.favor.description, '+0.5');
assert.equal(compactStatus.desire.value, 78);
assert.deepEqual(compactStatus.moods, ['心防失守', '极度别扭', '暗中准备']);
assert.equal(compactStatus.thought, '她明天真的要来。');
const before = calls;
assert.equal(readChatFloor(undefined), undefined);
assert.equal(readChatFloor(4), undefined);
assert.equal(readChatFloor(1), undefined);
assert.equal(calls, before);
assert.equal(readChatFloor('2').message_id, 2);
global.getChatMessages = range => {
  assert.equal(range, '0-3');
  return [];
};
assert.equal(readChatFloors({ role: 'assistant', hide_state: 'unhidden' }).length, 1);
global.getChatMessages = () => undefined;
assert.equal(readChatFloors({ role: 'assistant', hide_state: 'unhidden' })[0].message_id, 2);
assert.equal(readChatFloor(2).message_id, 2);
delete SillyTavern.chat;
assert.throws(() => readChatFloors(), /接口未返回聊天数组（undefined）/);
global.getChatMessages = () => {
  throw Error('disconnected');
};
assert.throws(() => readChatFloors(), /disconnected/);
console.log(
  'PASS: screenshot-shaped delta, sparse floors, swipe error recovery, selected text, hidden filtering, explicit bounds, empty/undefined API fallback, and read failures remain errors.',
);

(async () => {
  SillyTavern.getCurrentChatId = () => 'same';
  SillyTavern.chat = [{ name: 'Ghost', mes: text, swipe_id: 0, swipes: [text, 'keep'] }];
  global.getChatMessages = () => {
    throw new TypeError("Cannot read properties of undefined (reading 'swipe_id')");
  };
  global.setChatMessages = async () => {
    throw new TypeError("Cannot read properties of undefined (reading 'swipe_id')");
  };
  let saves = 0,
    renders = 0;
  SillyTavern.saveChat = async () => saves++;
  SillyTavern.updateMessageBlock = () => renders++;
  await writeChatFloor(0, text, text + ' card');
  assert.equal(SillyTavern.chat[0].mes, text + ' card');
  assert.equal(SillyTavern.chat[0].swipes[0], text + ' card');
  assert.equal(SillyTavern.chat[0].swipes[1], 'keep');
  assert.equal(saves, 1);
  assert.equal(renders, 1);
  await writeChatFloor(0, text, 'stale');
  assert.equal(saves, 1);
  assert.equal(SillyTavern.chat[0].mes, text + ' card');
  assert.equal(parsePhoneMessage('<角色手机><char1><status>角色名称：Simon</status></char1></角色手机>', 0).length, 0);
  assert.equal(parsePhoneMessage('<角色手机>' + text + '</角色手机>', 0).length, 0);
  console.log(
    'PASS: foreign phone isolation, fallback write persistence/render, selected swipe only, stale write protection.',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
