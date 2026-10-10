const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vue = require('vue');
const root = path.resolve('src/util/酒馆助手脚本/电波手机');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] || require(id), module, module.exports);
  return module.exports;
}
const playback = load('services/music/music-playback.ts');
const service = load('services/music/music.ts', { '../core/network': {}, '../apps/browser': {}, './music-backend': {} });
const raw = '歌曲名称：Here Comes the Sun\n歌手名称：The Beatles\n听歌感想：阳光还没出来。';
assert.deepEqual(service.musicIntent(JSON.stringify({ note: '新的感想' })), {
  title: '',
  artist: '',
  note: '新的感想',
});
assert.deepEqual(service.musicIntent(raw), {
  title: 'Here Comes the Sun',
  artist: 'The Beatles',
  note: '阳光还没出来。',
});
const track = id => ({
  id,
  title: 'Here Comes the Sun',
  artist: 'The Beatles',
  source: 'source-' + id,
  url: '',
  lyric: '',
  album: '',
  cover: '',
  lyricId: id,
});
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const resolved = [],
    played = [],
    queued = [];
  let audio,
    searches = 0;
  const phone = vue.reactive({
    settings: { musicApi: '', musicSource: 'aggregate', musicPlaybackMode: 'sequence', neteaseApi: '', qqMusicApi: '' },
    state: {
      activeCharKey: 'a',
      musicQueues: {},
      musicPlaylists: {},
      musicHiddenTracks: {},
      musicFavorites: {},
      musicCatalog: {},
    },
    rememberMusicTracks() {},
    saveMusicLibrary() {},
    saveSettings() {},
    listening: null,
  });
  class AudioMock extends EventTarget {
    constructor() {
      super();
      audio = this;
      this.src = '';
    }
    play() {
      played.push(this.src);
      const result = options.play?.(this.src);
      if (result) return result;
      this.onplaying?.();
      return Promise.resolve();
    }
    pause() {
      this.onpause?.();
    }
    removeAttribute() {
      this.src = '';
    }
    load() {}
  }
  global.Audio = AudioMock;
  const scope = vue.effectScope();
  const { useMusicStore } = load('stores/music.ts', {
    '../services/music/music-accounts': { accountProviders: [], cachedMusicAccount:()=>options.account },
    '../services/music/music-backend': { musicBackend: vue.ref('missing'), checkMusicBackend:async()=>{} },
    '../services/music/account-library': {
      applyPlaylistOverride: (row,edit={})=>edit.deleted?null:{...row,...edit}, readLibraryOverrides:async()=>({}), writeLibraryOverrides:async()=>{},
      libraryKey: (p,b,id)=>JSON.stringify([p,b,id]), readLibrary:async()=>[], writeLibrary:async()=>{},
      synchronizeLibrary:async()=>({rows:[{id:'remote',name:'同名歌单',cover:'',tracks:[track('remote')],remote:true,origin:JSON.stringify(['qq','https://api','user'])}],failed:0}),
    },
    pinia: { defineStore: (_id, setup) => () => vue.proxyRefs(scope.run(setup)) },
    vue,
    './phone': { usePhoneStore: () => phone },
    '../services/music/music': {
      musicIntent: service.musicIntent,
      parseLrc: () => [],
      searchMusic: async () => {
        searches++;
        return options.search ? options.search() : [track('1'), track('2'), track('3'), track('4')];
      },
      resolveTrack: async t => {
        resolved.push(t.id);
        return options.resolve ? options.resolve(t) : { ...t, url: 'https://audio/' + t.id };
      },
    },
    '../services/music/music-discovery': {
      simplifyLyrics: s => s,
      extraLyrics: async () => '',
      fetchRecommendations: async () => ({ tracks: [] }),
    },
    '../services/music/music-queue': { nextQueueIndex: () => -1 },
    '../services/music/music-playback': {
      startMusicPlayback: (audio, signal) => playback.startMusicPlayback(audio, signal, options.timeout || 12000),
    },
  });
  const store = useMusicStore();
  return {
    store,
    resolved,
    played,
    phone,
    get audio() {
      return audio;
    },
    get searches() {
      return searches;
    },
    dispose: () => scope.stop(),
  };
}
(async () => {
  const library = fixture({account:{id:'user',name:'User'}});
  library.store.createPlaylist('同名歌单');
  const manual = library.phone.state.musicPlaylists.a[0];
  await library.store.syncAccountLibrary('qq','https://api',{id:'user',name:'User'});
  assert.equal(library.store.playlists.length,2);
  assert.equal(library.phone.state.musicPlaylists.a[0],manual,'sync never overwrites manually created playlists');
  assert.equal(library.phone.state.musicPlaylists.a.length,1,'remote library stays out of chat storage');
  library.store.editPlaylist('remote','本地改名','local-cover');
  await library.store.syncAccountLibrary('qq','https://api',{id:'user',name:'User'},true);
  assert.equal(library.store.playlists.find(x=>x.id==='remote').name,'本地改名');
  library.store.deletePlaylist('remote');
  await library.store.syncAccountLibrary('qq','https://api',{id:'user',name:'User'},true);
  assert.equal(library.store.playlists.length,1,'resync retains local deletion');
  library.store.clearAccountLibrary('qq','https://api');
  assert.equal(library.store.playlists.length,1,'logout hides remote playlists only');
  library.dispose();
  let f = fixture({
    resolve: async t => {
      if (t.id === '1') throw Error('no URL');
      return { ...t, url: 'https://audio/' + t.id };
    },
    play: url =>
      url.endsWith('/2') ? Promise.reject(new DOMException('unsupported', 'NotSupportedError')) : undefined,
  });
  await f.store.sync(raw, 'a');
  assert.deepEqual(f.resolved, ['1', '2', '3']);
  assert.equal(f.store.current.id, '3');
  assert.equal(f.store.playing, true);
  assert.equal(f.phone.state.musicQueues.a.length, 1);
  assert.equal(f.phone.state.musicQueues.a[0].id, '3');
  const originalAudio = f.audio;
  f.phone.state.activeCharKey = 'group';
  await f.store.sync('', 'group');
  assert.equal(f.store.playing, true);
  assert.equal(f.audio, originalAudio);
  assert.equal(f.store.ownerKey, 'a');
  f.phone.state.activeCharKey = 'other';
  await f.store.sync(raw.replace('Here Comes the Sun', 'Other Song'), 'other');
  assert.equal(f.store.current.id, '3');
  assert.equal(f.searches, 1);
  assert.equal(f.store.queue, f.phone.state.musicQueues.a);
  assert.equal(f.phone.listening.charKey, 'a');
  f.phone.state.activeCharKey = 'a';
  await f.store.sync(raw.replace('阳光还没出来。', '感想更新。'), 'a');
  assert.equal(f.searches, 1);
  f.audio.onerror();
  await tick();
  assert.equal(f.store.current.id, '4');
  assert.equal(f.store.error, '');
  f.dispose();

  f = fixture({ play: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) });
  await f.store.sync(raw, 'a');
  assert.deepEqual(f.resolved, ['1']);
  assert.equal(f.store.current.id, '1');
  assert.match(f.store.error, /浏览器限制/);
  assert.equal(f.store.busy, false);
  f.dispose();

  let blocked = true;
  f = fixture({
    play: url =>
      blocked
        ? Promise.reject(new DOMException('blocked', 'NotAllowedError'))
        : url.endsWith('/1')
          ? Promise.reject(new Error('bad media'))
          : undefined,
  });
  await f.store.sync(raw, 'a');
  blocked = false;
  await f.store.toggle();
  assert.equal(f.store.current.id, '2');
  assert.equal(f.store.playing, true);
  f.dispose();

  f = fixture({ timeout: 5, play: url => (url.endsWith('/1') ? new Promise(() => {}) : undefined) });
  await f.store.sync(raw, 'a');
  assert.deepEqual(f.resolved, ['1', '2']);
  assert.equal(f.store.current.id, '2');
  f.dispose();

  f = fixture({
    resolve: async () => {
      throw Error('bad');
    },
  });
  await f.store.sync(raw, 'a');
  assert.equal(f.resolved.length, 4);
  assert.equal(f.store.current, null);
  assert.equal(f.store.busy, false);
  assert.match(f.store.error, /全部搜索结果/);
  f.dispose();

  let release;
  f = fixture({
    search: () =>
      new Promise(resolve => {
        release = resolve;
      }),
  });
  const pending = f.store.sync(raw, 'a');
  f.store.stop();
  release([track('1')]);
  await pending;
  assert.equal(f.resolved.length, 0);
  assert.equal(f.store.current, null);
  f.dispose();

  f = fixture({
    resolve: t =>
      t.id === '1'
        ? new Promise(resolve => {
            release = resolve;
          })
        : Promise.resolve({ ...t, url: 'https://audio/' + t.id }),
  });
  const stale = f.store.sync(raw, 'a');
  await tick();
  await f.store.select(track('manual'));
  release({ ...track('1'), url: 'https://audio/1' });
  await stale;
  assert.equal(f.store.current.id, 'manual');
  assert.deepEqual(f.played, ['https://audio/manual']);
  f.dispose();

  let retrySearches = 0;
  f = fixture({ search: async () => { retrySearches++; return []; } });
  await f.store.sync(raw, 'a');
  assert.match(f.store.error, /未找到歌曲/);
  assert.equal(f.store.searching, false);
  await f.store.sync(raw, 'a');
  assert.equal(retrySearches, 1, 'reactive sync must not loop after failure');
  await f.store.sync(raw, 'a', false, true);
  assert.equal(retrySearches, 2, 'explicit app entry retries failed request');
  assert.equal(f.store.busy, false);
  assert.match(f.store.error, /未找到歌曲/);
  f.dispose();

  let rejectLate,
    pauses = 0;
  const hanging = new EventTarget();
  hanging.pause = () => pauses++;
  hanging.play = () =>
    new Promise((_resolve, reject) => {
      rejectLate = reject;
    });
  await assert.rejects(playback.startMusicPlayback(hanging, new AbortController().signal, 5), /超时/);
  assert.equal(pauses, 1);
  rejectLate(Error('late rejection'));
  await tick();
  assert.equal(pauses, 1);
  const controller = new AbortController();
  const cancelled = playback.startMusicPlayback(hanging, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  console.log(
    'PASS: music parsing, ordered source fallback, actual autoplay, late media errors, note-only updates, browser policy, exhausted/empty results, stop/manual cancellation, timeout and stale promise cleanup.',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
