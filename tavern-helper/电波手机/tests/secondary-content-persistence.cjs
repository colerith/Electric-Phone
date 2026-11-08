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
global.SillyTavern.getContext = () => ({ substituteParams: text => text });
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
  app_updates: {
    status: '状态更新',
    calendar: { events: [{ id: 'event-1', date: '2026-11-06', time: '12:00', content: '日程更新' }] },
    browse: { notes: [{ id: 'browse-1', title: '浏览更新', content: '内容' }] },
    music: '音乐更新',
    memo: '新增备忘',
    zone: { profile: { username: 'Alice' }, posts: [{ id: 'zone-1', content: '今天有风' }] },
    wallet: { balance: 100, transactions: [] },
  },
};
(async () => {
  global.indexedDB = require('fake-indexeddb').indexedDB;
  store.settings.basic.cacheEnabled = true;
  floors = [{ message_id: 1, role: 'assistant', message: '正文' }];
  global.setChatMessages = async rows =>
    rows.forEach(row =>
      Object.assign(
        floors.find(f => f.message_id === row.message_id),
        row,
      ),
    );
  await store.synchronize();
  const key = store.state.activeCharKey;
  const { saveSecondaryResult } = require(base + '/services/generation/secondary-results.ts');
  floors[0].message += '<!--wave-phone-card:start-->legacy card<!--wave-phone-card:end-->';
  saveSecondaryResult(
    store.state.secondaryResults,
    floors[0],
    serializeDelta({ ...delta, char_id: store.activeIdentity.stableId }),
  );
  store.saveChat();
  await store.synchronize();
  const before = { ...store.activeSnapshot };
  const memo = store.activeSnapshot.memo;
  assert(memo.includes('新增备忘'));
  store.currentPage = 'memo';
  store.markAppRead('memo');
  await store.synchronize();
  assert.equal(
    store.activeSnapshot.memo,
    memo,
    'opening/sync after automatic card cleanup must retain secondary content',
  );
  for (const app of ['memo', 'status', 'calendar', 'browse', 'music', 'zone']) {
    store.currentPage = app;
    store.markAppRead(app);
    await store.synchronize();
    assert.equal(store.activeSnapshot[app], before[app], app + ' survives repeated opening and cached replay');
  }
  store.settings.appearance.coverWallpaper = 'legacy-global';
  assert.equal(store.characterWallpaper.coverWallpaper, '', 'legacy global wallpaper never leaks into a character');
  const firstScope = store.wallpaperScope;
  store.setCharacterWallpaper('coverWallpaper', 'alice-cover');
  store.setCharacterWallpaper('desktopWallpaper', 'alice-desktop');
  const bob = store.addContact('Bob', 'Main');
  store.selectIdentity(bob);
  assert.equal(store.characterWallpaper.coverWallpaper, '');
  store.setCharacterWallpaper('coverWallpaper', 'bob-cover');
  store.selectIdentity(key);
  assert.equal(store.characterWallpaper.coverWallpaper, 'alice-cover');
  assert.equal(store.characterWallpaper.desktopWallpaper, 'alice-desktop');
  store.setCharacterWallpaper('coverWallpaper', '');
  assert.equal(store.characterWallpaper.coverWallpaper, '');
  store.selectIdentity(bob);
  assert.equal(store.characterWallpaper.coverWallpaper, 'bob-cover');
  const { ScriptSettingsSchema } = require(base + '/schemas.ts');
  const restored = ScriptSettingsSchema.parse(JSON.parse(JSON.stringify(store.settings)));
  assert.equal(restored.appearance.characterWallpapers[firstScope].desktopWallpaper, 'alice-desktop');
  const { withSecondaryResults } = require(base + '/services/generation/secondary-results.ts');
  assert.equal(
    withSecondaryResults([{ ...floors[0], message: '真正修改正文' }], store.state.secondaryResults)[0].message,
    '真正修改正文',
  );
  assert.deepEqual(withSecondaryResults([], store.state.secondaryResults), []);
  // Repeated read-only synchronization must not rewrite upload revisions.
  await store.synchronize();
  const content = () =>
    JSON.parse(
      JSON.stringify(vars, (key, value) => (/^wave_phone_(?:global_)?saved_at$/.test(key) ? undefined : value)),
    );
  const persisted = content();
  await new Promise(resolve => setTimeout(resolve, 15));
  await store.synchronize();
  const differences = (a, b, path = '') => {
    if (_.isEqual(a, b)) return [];
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [path];
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key =>
      differences(a[key], b[key], path + '/' + key),
    );
  };
  assert.deepEqual(differences(content(), persisted), [], 'unchanged synchronization produces no changed content');
  store.settings.basic.excludedCards = ['Alice'];
  store.saveSettings();
  const contacts = Object.keys(store.state.identities);
  await store.synchronize();
  assert.deepEqual(Object.keys(store.state.identities), contacts, 'excluded cards retain their contacts');
  assert.equal(store.state.identities[bob].name, 'Bob');
  chat = 'new-excluded-chat';
  vars.chat = {};
  await store.synchronize();
  assert.equal(store.state.identities[bob].name, 'Bob', 'excluded new chats inherit the card roster');
  store.context.cardKey = 'another-card';
  assert.equal(store.characterWallpaper.coverWallpaper, '', 'same character key on another card is isolated');
  console.log(
    'PASS secondary cleanup/cached replay across apps, real edits, deletion, character wallpapers and persisted reset',
  );
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
