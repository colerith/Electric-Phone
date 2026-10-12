const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const { reactive, effectScope, computed, ref, watch, nextTick } = require('vue');
const source = fs.readFileSync(path.resolve(__dirname, '../components/music/WaveMusicPanel.vue'), 'utf8');
const section = source.slice(source.indexOf('const lyricModes ='), source.indexOf('const collecting ='));
const code = ts.transpileModule(section + '\nreturn { translation, romanization, lyricModeIndex, cycleLyricMode };', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const music = reactive({ current: { id: 'same', source: 'qq', lyric: '' } });
const phone = reactive({
  settings: { musicLyricMode: 0 },
  setMusicLyricMode(value) {
    this.settings.musicLyricMode = value;
  },
});
const requests = [];
const scope = effectScope();
let cleanup;
const model = scope.run(() =>
  new Function(
    'computed',
    'ref',
    'watch',
    'onBeforeUnmount',
    'music',
    'phone',
    'fetchBuiltinLyricTracks',
    'parseLrc',
    'hasAlternateText',
    code,
  )(
    computed,
    ref,
    watch,
    fn => (cleanup = fn),
    music,
    phone,
    (track, signal, force, mode) => new Promise(resolve => requests.push({ track, signal, mode, resolve })),
    text => (text ? [{ time: 0, text }] : []),
    text => Boolean(text),
  ),
);
(async () => {
  assert.equal(requests.length, 1);
  music.current = { id: 'same', source: 'qq', lyric: 'refetched' };
  await nextTick();
  assert.equal(requests.length, 2, 'same-ID playlist reload must load alternates again');
  assert(requests[0].signal.aborted);
  requests[0].resolve({ translation: 'stale', lyric: 'stale' });
  requests[1].resolve({ translation: 'new translation', lyric: 'matched original' });
  await nextTick();
  await nextTick();
  assert.equal(model.translation.value[0].text, 'new translation');
  assert.equal(phone.settings.musicLyricMode, 0);
  phone.settings.musicLyricMode = 2;
  await nextTick();
  assert.equal(requests.at(-1).mode, 'romanization', 'restored setting triggers the correct lyric request');
  requests.at(-1).resolve({ romanization: 'romaji', lyric: 'original' });
  await nextTick();
  await nextTick();
  assert.equal(model.romanization.value[0].text, 'romaji');
  phone.settings.musicLyricMode = 3;
  await nextTick();
  const count = requests.length;
  music.current = { id: 'same', source: 'qq', lyric: '' };
  await nextTick();
  assert.equal(requests.length, count, 'off stays off across refresh');
  assert.equal(phone.settings.musicLyricMode, 3);
  cleanup();
  scope.stop();
  console.log('PASS: same-ID reload, stale responses, restored lyric mode and disabled mode');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
