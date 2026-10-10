const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { ScriptSettingsSchema } = require(base + '/schemas.ts');
const { prepareContext, boundWorldbooks, matchesWorldbookKey } = require(
  base + '/services/generation/context-controls.ts',
);
const { worldbookKeywords, readWorldbookEntries } = require(base + '/services/generation/worldbook-reader.ts');
const foreignRegex = require('node:vm').runInNewContext('/hello/gi');
let rawReads = 0;
global.SillyTavern = {
  loadWorldInfo: async () => {
    ++rawReads;
    return {
      entries: {
        1: {
          uid: 1,
          comment: 'regex',
          content: 'REGEX-CONTENT',
          key: [{ source: 'hello', flags: 'i' }, 12, null],
          keysecondary: ['world'],
          selectiveLogic: 0,
        },
        2: { uid: 2, comment: 'constant', content: 'CONSTANT', constant: true, key: [{}] },
        3: { uid: 3, content: 'DISABLED', constant: true, disable: true },
        4: { uid: 4, content: 'INVALID-KEY', key: [12, {}] },
      },
    };
  },
};
global.getCharWorldbookNames = () => ({ primary: 'book', additional: ['book', 12, {}, null] });
global.getChatMessages = () => [{ message_id: 1, role: 'assistant', message: 'HELLO world', is_hidden: false }];
global.getWorldbook = async () => {
  throw new TypeError('A.toLocaleLowerCase is not a function');
};
(async () => {
  assert.equal(ScriptSettingsSchema.parse({}).basic.historyDepth, 20);
  assert.equal(ScriptSettingsSchema.parse({ basic: { historyDepth: null } }).basic.historyDepth, null);
  assert.equal(ScriptSettingsSchema.parse({ basic: { historyDepth: 0 } }).basic.historyDepth, 0);
  assert.deepEqual(boundWorldbooks(), ['book']);
  const keys = worldbookKeywords([foreignRegex, { source: 'hello', flags: 'i' }, 12, null, {}, '/test/i']);
  assert.equal(keys.length, 3);
  assert(keys[0].test('HELLO'));
  assert(keys[1].test('HELLO'));
  const settings = ScriptSettingsSchema.parse({ worldbooks: { managed: true } });
  const context = await prepareContext(settings);
  assert.equal(rawReads, 1);
  assert(context.world_info_before.includes('REGEX-CONTENT'));
  assert(context.world_info_before.includes('CONSTANT'));
  assert(!context.world_info_before.includes('DISABLED'));
  assert(!context.world_info_before.includes('INVALID-KEY'));
  global.getWorldbook = async () => {
    throw Error('Network failure');
  };
  await assert.rejects(readWorldbookEntries('book'), /读取世界书.*Network failure/);
  assert.equal(rawReads, 1, 'real read errors must not be swallowed');
  const emojiBook = '🌙 世界书 👩🏽‍🚀';
  global.getWorldbook = async () => {
    throw new DOMException('The string contains characters outside of the Latin1 range', 'InvalidCharacterError');
  };
  global.SillyTavern.loadWorldInfo = async name => {
    assert.equal(name, emojiBook);
    return { entries: { 7: { uid: 7, comment: '角色 🐈‍⬛', content: '保留表情 👨‍👩‍👧‍👦 与中文', key: ['🌙', '👩🏽‍🚀'] } } };
  };
  const emojiRows = await readWorldbookEntries(emojiBook);
  assert.equal(emojiRows[0].name, '角色 🐈‍⬛');
  assert.equal(emojiRows[0].content, '保留表情 👨‍👩‍👧‍👦 与中文');
  assert(matchesWorldbookKey(emojiRows[0].strategy.keys[1], '今天 👩🏽‍🚀'));
  console.log('PASS emoji worldbook name, title, content and keyword fallback without rewriting data');
  console.log(
    'PASS history default 20; malformed names, foreign/serialized regex and helper worldbook conversion fallback',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
