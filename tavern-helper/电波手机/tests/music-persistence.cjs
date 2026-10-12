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
const base = path.resolve(__dirname, '..');
const { createPinia, setActivePinia } = require('pinia');
setActivePinia(createPinia());
const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const store = usePhoneStore();
store.settings.basic.cacheEnabled = false;

(async () => {
  await store.synchronize();
  const key = store.state.activeCharKey;
  let flushes = 0;
  require(base + '/services/core/durable-storage.ts').flushPhoneStorage = async () => {
    flushes++;
  };
  const track = require(base + '/services/music/music.ts').MusicTrackSchema.parse({
    id: 'saved-song',
    title: 'Song',
    artist: 'Artist',
    album: '',
    cover: '',
    lyricId: '',
    source: 'qq',
  });
  const cache = require(base + '/services/core/local-cache.ts');
  let unblock, entered;
  const started = new Promise(resolve => (entered = resolve));
  cache.chatParseSignature = async () => 'test';
  cache.cachedParse = async () => {
    entered();
    await new Promise(resolve => (unblock = resolve));
    return [];
  };
  store.settings.basic.cacheEnabled = true;
  const syncing = store.synchronize();
  await started;
  store.rememberMusicTracks([track]);
  store.toggleMusicFavorite('qq:saved-song');
  store.state.musicPlaylists[key] = [{ id: 'local', name: 'My playlist', cover: '', tracks: [track] }];
  store.saveMusicLibrary();
  unblock();
  await syncing;
  assert(flushes > 0, 'music writes flush without waiting for the autosave timer');
  assert.deepEqual([...store.state.musicFavorites[key]], ['qq:saved-song'], 'in-flight sync must not erase favorites');
  assert.equal(store.state.musicPlaylists[key][0].tracks[0].id, 'saved-song');
  store.settings.basic.cacheEnabled = false;
  store.setMusicLyricMode(0);
  setActivePinia(createPinia());
  const reopened = usePhoneStore();
  reopened.settings.basic.cacheEnabled = false;
  await reopened.synchronize();
  assert.deepEqual([...reopened.state.musicFavorites[key]], ['qq:saved-song']);
  assert.equal(reopened.settings.musicLyricMode, 0);
  assert.equal(reopened.state.musicCatalog[key][0].title, 'Song');
  assert.equal(reopened.state.musicPlaylists[key][0].name, 'My playlist');
  assert.equal(reopened.state.musicPlaylists[key][0].tracks.length, 1);
  reopened.toggleMusicFavorite('qq:saved-song');
  reopened.state.musicPlaylists[key][0].tracks = [];
  reopened.state.musicPlaylists[key][0].name = 'Renamed';
  reopened.saveMusicLibrary();
  reopened.setMusicLyricMode(2);
  setActivePinia(createPinia());
  const again = usePhoneStore();
  again.settings.basic.cacheEnabled = false;
  await again.synchronize();
  assert.deepEqual([...again.state.musicFavorites[key]], []);
  assert.equal(again.state.musicPlaylists[key][0].tracks.length, 0);
  assert.equal(again.state.musicPlaylists[key][0].name, 'Renamed');
  assert.equal(again.settings.musicLyricMode, 2);
  console.log('PASS: favorites and local playlists survive sync race/reopen, removals and renames persist');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
