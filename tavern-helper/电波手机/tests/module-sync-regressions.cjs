const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global.z = require('zod').z;
global._ = require('lodash');
const { parseJsonResponse } = require('../services/generation/json-response.ts');
const { readModuleDeltas } = require('../services/generation/module-protocol.ts');
const { parsePhoneMessage, mergeAppSnapshot } = require('../services/generation/parser.ts');
const { musicIntent } = require('../services/music/music.ts');
const { sanitizeOutgoingPhoneHistory, constrainPhoneFloor } = require('../services/generation/follow-generation.ts');
const { ModuleSettingsSchema } = require('../services/generation/module-settings.ts');
const face = String.raw`{"text":"颜文字 \(o_o)/ 与 \q、\uZZZZ"}`;
assert.equal(parseJsonResponse(face).text, String.raw`颜文字 \(o_o)/ 与 \q、\uZZZZ`);
assert.deepEqual(parseJsonResponse('{"text":"a\\nb","quote":"\\\"","slash":"\\\\"}'), {
  text: 'a\nb',
  quote: '"',
  slash: '\\',
});
assert.throws(() => parseJsonResponse('{"text":"unfinished\\'), SyntaxError);
const block =
  '<wave_phone_delta>' +
  String.raw`{"version":1,"char_id":"a","char_name":"A","app_updates":{"memo":"备忘：\(o_o)/","music":"歌曲名称：Second\n歌手名称：Artist"}}` +
  '</wave_phone_delta>';
assert.equal(readModuleDeltas(block).length, 1);
const snapshot = { sourceMessageIds: [], music: '歌曲名称：First\n歌手名称：Old', memo: '' };
const updated = mergeAppSnapshot(snapshot, parsePhoneMessage(block, 1)[0]);
assert.equal(musicIntent(updated.music).title, 'Second');
assert.equal(musicIntent(snapshot.music + '\n' + updated.music).title, 'Second');
assert.equal(musicIntent('{"title":"First"}\n{"title":"Second"}').title, 'Second');
const outgoing = [
  { role: 'assistant', content: '正文' + block + '后文<wave_moments>{}</wave_moments>' },
  {
    role: 'user',
    content: [
      { type: 'text', text: '用户<wave_tree_hole>{}</wave_tree_hole>' },
      { type: 'image_url', image_url: { url: 'keep' } },
    ],
  },
  { role: 'system', content: '<wave_phone_follow_context>当前任务</wave_phone_follow_context>' },
];
sanitizeOutgoingPhoneHistory(outgoing);
assert.equal(outgoing[0].content, '正文后文');
assert.equal(outgoing[1].content[0].text, '用户');
assert.equal(outgoing[1].content[1].image_url.url, 'keep');
assert(outgoing[2].content.includes('当前任务'));
assert(block.includes('app_updates'), 'stored source remains intact');
assert.equal(
  constrainPhoneFloor('正文' + block, ModuleSettingsSchema.parse({}), 'a', snapshot, undefined, undefined, []),
  '正文',
);
const allowed = readModuleDeltas(
  constrainPhoneFloor(block, ModuleSettingsSchema.parse({}), 'a', snapshot, undefined, undefined, ['music']),
)[0];
assert.deepEqual(Object.keys(allowed.app_updates), ['music']);
console.log(
  'PASS malformed escapes, floor recovery, latest music, outgoing history isolation and primary module allowlist',
);
