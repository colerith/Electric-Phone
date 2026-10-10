const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
global.DOMParser = new JSDOM('').window.DOMParser;
const code = ts.transpileModule(
  fs.readFileSync(path.resolve('src/util/酒馆助手脚本/电波手机/services/music/music-lyrics.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const m = { exports: {} };
new Function('require', 'module', 'exports', code)(() => ({}), m, m.exports);
const result = m.exports.ttmlToLrc(
  '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><p begin="00:01.250"><span>Hello</span><span ttm:role="x-translation">你好</span></p><p begin="65000ms">World</p></body></tt>',
);
assert.equal(result, '[00:01.25]Hello\n[01:05.00]World');
assert.equal(m.exports.ttmlToLrc('<invalid'), '');
console.log('PASS: AMLL TTML timing conversion and translation separation');

assert.equal(
  m.exports.ttmlToLrc(
    '<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><p begin="1s">Hi<span ttm:role="x-translation">你好</span><span ttm:role="x-romanization">ni hao</span></p></tt>',
    'romanization',
  ),
  '[00:01.00]ni hao',
);

(async () => {
  const fresh = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    () => ({ musicBackend: { value: 'ready' } }),
    fresh,
    fresh.exports,
  );
  global.SillyTavern = { getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) };
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.id, 'stable-mid');
    assert.equal(body.songId, '123');
    assert.equal(body.alternate, 'translation');
    return { ok: true, json: async () => ({ lyric: '', translation: '[00:01]译文', romanization: '', format: 'lrc' }) };
  };
  const tracks = await fresh.exports.fetchBuiltinLyricTracks(
    { source: 'account-qq', id: 'stable-mid', songId: '123', title: 'Song', artist: 'Artist' },
    undefined,
    true,
    'translation',
  );
  assert.equal(tracks.translation, '[00:01]译文', 'translation remains usable even when modern original is encrypted');
  console.log('PASS: numeric QQ identity, requested alternate and translation-only response');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
assert.equal(m.exports.hasAlternateText('//'), false);
assert.equal(m.exports.hasAlternateText(' ／ ／ '), false);
assert.equal(m.exports.hasAlternateText('  '), false);
assert.equal(m.exports.hasAlternateText('真的译文 / 分句'), true);
