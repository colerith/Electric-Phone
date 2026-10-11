const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="forms"></div><div id="mentions"></div>', { url: 'http://localhost' });
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event'])
  global[name] = dom.window[name];
const compile = source =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
global.z = require('zod').z;
global._ = require('lodash');
const base = path.resolve(__dirname, '..');
const { ScriptSettingsSchema } = require(base + '/schemas.ts');
const { musicBackend } = require(base + '/services/music/music-backend.ts');
const { fetchRecommendations } = require(base + '/services/music/music-discovery.ts');
global.SillyTavern = { getRequestHeaders: () => ({ 'X-CSRF-Token': 'test-token' }) };
(async () => {
  const defaults = ScriptSettingsSchema.parse({});
  assert.equal(defaults.musicLyricMode, 3);
  for (const mode of [0, 1, 2, 3]) {
    const saved = ScriptSettingsSchema.parse({ ...defaults, musicLyricMode: mode });
    assert.equal(ScriptSettingsSchema.parse(JSON.parse(JSON.stringify(saved))).musicLyricMode, mode);
  }
  musicBackend.value = 'ready';
  let calls = [];
  global.fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-CSRF-Token'], 'test-token');
    assert.equal(options.credentials, 'same-origin');
    if (String(url).endsWith('/qq/new/songs')) return { ok: true, json: async () => ({code:200,data:{list:[{id:123,mid:'song-mid',name:'新歌',singer:[{name:'歌手'}]}]}}) };
    if (String(url).endsWith('/netease/recommend/songs')) return {ok:true,json:async()=>({code:200,data:{dailySongs:[{id:456,name:'日推',ar:[{name:'歌手'}]}]}})};
    throw Error('unexpected URL ' + url);
  };
  const qq = await fetchRecommendations('tencent', defaults.neteaseApi, '', undefined, true);
  assert.equal(qq.label, 'QQ 音乐 · 新歌精选');
  assert.equal(qq.tracks[0].source, 'builtin-qq');
  assert.equal(qq.tracks[0].songId, '123');
  const ne = await fetchRecommendations('netease', defaults.neteaseApi, '', undefined, true);
  assert.equal(ne.label, '今日推荐');
  assert.equal(ne.tracks[0].id, '456');
  assert.equal(calls.length, 2);
  console.log('PASS: all lyric modes survive settings reload; QQ built-in recommendations and NetEase daily songs use authenticated same-origin routes');
})().catch(error=>{ console.error(error); process.exitCode=1 });
