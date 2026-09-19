const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' });
for (const key of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
])
  global[key] = dom.window[key];
const compile = code =>
  ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const { parse, compileScript } = require('vue/compiler-sfc');
require.extensions['.vue'] = (m, f) => {
  const { descriptor } = parse(fs.readFileSync(f, 'utf8'));
  m._compile(compile(compileScript(descriptor, { id: f, inlineTemplate: true }).content), f);
};
global._ = require('lodash');
global.z = require('zod').z;
let chatKey = 'chat-A';
const chats = { 'chat-A': {}, 'chat-B': {}, 'chat-other': {} },
  vars = { global: {}, script: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chatKey, characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => (type === 'chat' ? chats[chatKey] : vars[type]),
  replaceVariables: (value, { type }) => {
    if (type === 'chat') chats[chatKey] = value;
    else vars[type] = value;
  },
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const { accountWallet, accountRows, applyWalletPatch, walletAuthorization } = require(
  base + '/services/wallet/wallet-accounts.ts',
);
const { WalletTransactionSchema } = require(base + '/services/wallet/wallet.ts');
const { MomentPostSchema } = require(base + '/services/space/moments.ts');
const { dailyTopic, treeHoleDay } = require(base + '/services/space/tree-hole.ts');
const { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const Space = require(base + '/components/space/WaveSpace.vue').default;
const Messenger = require(base + '/components/chat/WaveMessenger.vue').default;
const Settings = require(base + '/components/settings/WaveAppSettings.vue').default;
const settingsApp = vue.ref('zone');
let phone, space;
const screen = vue.ref('space'),
  surface = vue.ref(null);
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h(
        'div',
        { id: 'wave-phone-script-root' },
        vue.h(
          'section',
          { class: 'wave-device', ref: surface },
          screen.value === 'space'
            ? vue.h(Space, {
                ref: value => (space = value),
                raw: phone.activeSnapshot.zone,
                artwork: phone.state.appArtwork[phone.state.activeCharKey]?.zone || '',
                name: 'Alice',
                avatar: '',
                userName: 'User',
                userAvatar: '',
                busy: false,
                error: '',
              })
            : screen.value === 'settings'
              ? vue.h(Settings, {
                  app: settingsApp.value,
                  name: '空间',
                  artwork: '',
                  weatherLocation: null,
                  searchEngine: 'bing',
                  browserEndpoint: '',
                  musicApi: '',
                  musicSource: '',
                })
              : vue.h(Messenger, { userName: 'User', userAvatar: '' }),
        ),
      );
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const click = (selector, text) => {
  const button = [...document.querySelectorAll(selector)].find(button => button.textContent.includes(text));
  assert(button, `missing ${text}`);
  button.click();
};
const row = (id, amount) => WalletTransactionSchema.parse({ id, title: '午餐', amount, direction: 'expense' });
const balance = id => accountWallet(phone.state.walletBook, phone.state.walletBook.accounts[id]).balance;
const saveAccount = (id, amount) =>
  phone.saveWalletAccount(id, {
    name: '生活账户',
    currency: 'CNY',
    balance: amount,
    bankName: '测试银行',
    cardLabel: '储蓄卡',
    cardLastFour: '1234',
  });
function snapshot(name) {
  if (!process.env.WAVE_VISUAL_QA) return;
  const sass = require('sass');
  const imports = [...fs.readFileSync(base + '/index.ts', 'utf8').matchAll(/import '\.\/(.+\.scss)'/g)].map(
    match => match[1],
  );
  const css = imports.map(file => sass.compile(path.join(base, file), { logger: sass.Logger.silent }).css).join('\n');
  fs.mkdirSync('.wave-qa', { recursive: true });
  fs.writeFileSync(
    '.wave-qa/' + name + '.html',
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"><style>' +
      css +
      [
        ...fs.readFileSync(base + '/app.vue', 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
        ...fs
          .readFileSync(base + '/components/space/WaveMoments.vue', 'utf8')
          .matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
      ]
        .map(match => sass.compileString(match[1], { logger: sass.Logger.silent }).css)
        .join('\n') +
      [
        ...fs
          .readFileSync(base + '/components/settings/WaveAppSettings.vue', 'utf8')
          .matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
      ]
        .map(match => sass.compileString(match[1], { logger: sass.Logger.silent }).css)
        .join('\n') +
      '#wave-phone-script-root .wave-device{position:relative!important;left:auto!important;top:auto!important;transform:none!important;min-width:0!important;width:390px!important;height:780px!important;margin:10px auto!important;display:flex!important;--wave-ui-font:Arial,sans-serif;--wave-font-scale:1;--wave-card:#fff;--wave-text:#354259;--wave-muted:#95a0af;--settings-accent:#6487ba;}body{margin:0;background:#e8ecf2}</style>' +
      `<div id="wave-phone-script-root"><div class="wave-phone-host">${surface.value.outerHTML}</div></div>`,
  );
}
(async () => {
  const { ChatStateSchema } = require(base + '/schemas.ts');
  const { CharacterDefaultsSchema, captureMissingDefaults, inheritCharacterDefaults } = require(
    base + '/services/core/character-defaults.ts',
  );
  const defaults = CharacterDefaultsSchema.parse({});
  const oldChat = (key, opening, expense) =>
    ChatStateSchema.parse({
      chatKey: key,
      walletBook: {
        accounts: {
          user: {
            id: 'user',
            name: '原账户',
            ownerType: 'user',
            ownerId: 'user',
            opening: { CNY: opening },
            manual: { old: { ...row('old', expense), currency: 'CNY' } },
          },
        },
      },
    });
  const oldA = oldChat('old-A', 100, 10),
    oldB = oldChat('old-B', 200, 20);
  captureMissingDefaults(oldA, defaults);
  captureMissingDefaults(oldB, defaults);
  inheritCharacterDefaults(oldA, defaults);
  assert.equal(accountWallet(oldA.walletBook, oldA.walletBook.accounts.user).balance, 70);
  assert.equal(accountRows(oldA.walletBook, oldA.walletBook.accounts.user).length, 2);
  captureMissingDefaults(oldB, defaults);
  inheritCharacterDefaults(oldB, defaults);
  assert.equal(accountWallet(oldB.walletBook, oldB.walletBook.accounts.user).balance, 70);
  await phone.synchronize();
  const char = phone.state.activeCharKey,
    id = 'char:' + char;
  saveAccount(id, 100);
  phone.addWalletTransaction(row('manual-A', 10), id);
  phone.setAppArtwork('zone', 'zone-stars');
  phone.setAppArtwork('wallet', 'card-pencil');
  const sharedId = phone.createSharedWallet('共同账户');
  phone.selectSharedWallet(sharedId);
  assert.equal(balance(id), 90);
  chatKey = 'chat-B';
  await phone.synchronize();
  assert.equal(balance(id), 90);
  assert.equal(phone.state.walletBook.selectedShared[char], sharedId);
  assert.equal(phone.state.appArtwork[char].zone, 'zone-stars');
  assert.equal(phone.state.appArtwork[char].wallet, 'card-pencil');
  phone.addWalletTransaction(row('manual-B', 20), id);
  assert.equal(balance(id), 70);
  chatKey = 'chat-A';
  await phone.synchronize();
  assert.equal(balance(id), 70);
  assert.equal(accountRows(phone.state.walletBook, phone.state.walletBook.accounts[id]).length, 2);
  await phone.synchronize();
  assert.equal(balance(id), 70);
  saveAccount(id, 200);
  chatKey = 'chat-B';
  await phone.synchronize();
  assert.equal(balance(id), 200);
  phone.deleteWalletTransaction('manual-A', id);
  chatKey = 'chat-A';
  await phone.synchronize();
  assert.equal(balance(id), 200);
  assert(
    !accountRows(phone.state.walletBook, phone.state.walletBook.accounts[id]).some(item => item.id === 'manual-A'),
  );
  // Equal model IDs in two conversations do not collide; replay remains idempotent.
  phone.selectSharedWallet('');
  const grant = walletAuthorization(phone.state.walletBook, char);
  applyWalletPatch(phone.state.walletBook, { transactions: [row('same-id', 3)] }, grant, 'chat:chat-A:floor:1');
  applyWalletPatch(phone.state.walletBook, { transactions: [row('same-id', 4)] }, grant, 'chat:chat-B:floor:1');
  const before = balance(id);
  applyWalletPatch(phone.state.walletBook, { transactions: [row('same-id', 3)] }, grant, 'chat:chat-A:floor:1');
  assert.equal(balance(id), before);
  assert.equal(
    accountRows(phone.state.walletBook, phone.state.walletBook.accounts[id]).filter(item =>
      item.id.endsWith(':same-id'),
    ).length,
    2,
  );
  SillyTavern.characterId = '2';
  chatKey = 'chat-other';
  await phone.synchronize();
  assert.equal(balance('char:' + phone.state.activeCharKey), null);
  SillyTavern.characterId = '1';
  chatKey = 'chat-A';
  await phone.synchronize();
  assert.equal(balance(id), 200);
  const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
  const floorsByChat = {};
  global.getChatMessages = () => floorsByChat[chatKey] || [];
  const floor = amount => ({
    message_id: 0,
    role: 'assistant',
    message: serializeDelta({
      version: 1,
      char_id: phone.activeIdentity.stableId || char,
      char_name: phone.activeIdentity.name,
      messages: [],
      app_updates: {
        wallet: { ...walletAuthorization(phone.state.walletBook, char), transactions: [row('floor-id', amount)] },
      },
    }),
  });
  floorsByChat['chat-A'] = [floor(3)];
  await phone.synchronize();
  assert.equal(balance(id), 197);
  chatKey = 'chat-B';
  await phone.synchronize();
  phone.selectSharedWallet('');
  floorsByChat['chat-B'] = [floor(4)];
  await phone.synchronize();
  assert.equal(balance(id), 193);
  chatKey = 'chat-A';
  await phone.synchronize();
  assert.equal(balance(id), 193);
  floorsByChat['chat-A'] = [];
  await phone.synchronize();
  assert.equal(balance(id), 196);
  chatKey = 'chat-B';
  await phone.synchronize();
  assert.equal(balance(id), 196);
  floorsByChat['chat-B'] = [];
  await phone.synchronize();
  assert.equal(balance(id), 200);
  chatKey = 'chat-A';
  await phone.synchronize();
  // Existing zone comments/likes remain visible in the combined space feed.
  phone.state.snapshots[char].zone = JSON.stringify({
    profile: { signature: '在平凡的日子里收集微光。' },
    posts: [
      {
        id: 'old',
        content: '阳光落在窗台上，今天也是值得记住的一天。',
        date: '2026-09-19',
        comments: [{ id: 'c1', author: 'Alice', content: '欢迎来我的空间', createdAt: '2026-09-19T09:00:00' }],
      },
    ],
  });
  phone.state.zoneInteractions[char] = { old: { liked: true, comments: [], shares: 0 } };
  const legacy = `zone:${char}:old`;
  assert(phone.momentsFeed.comments.some(item => item.postId === legacy));
  phone.likeMoment(legacy);
  assert(!phone.momentsFeed.likes.some(item => item.postId === legacy && item.authorKey === 'user'));
  phone.likeMoment(legacy);
  assert.equal(phone.momentsFeed.likes.filter(item => item.postId === legacy && item.authorKey === 'user').length, 1);
  await tick();
  assert.equal(document.querySelectorAll('.space-bottom button').length, 5);
  assert.equal(document.querySelectorAll('.space-comment').length, 1);
  snapshot('space-char');
  phone.publishMoment({
    content: '今天完成了一件小事，很开心。',
    images: [],
    location: '',
    mentions: [],
    visibility: 'all',
    audience: [],
  });
  const ownId = phone.state.moments.posts[0].id;
  phone.state.moments.posts.push(
    MomentPostSchema.parse({
      id: 'other',
      authorKey: 'other',
      authorName: '旅行中的朋友',
      content: '下一站，会遇到怎样的风景？',
      createdAt: Date.now(),
      availableAt: 0,
    }),
  );
  phone.likeMoment('other');
  await phone.commentMoment('other', '一路顺风');
  click('.space-bottom button', '我的');
  await tick();
  assert(document.body.textContent.includes('今天完成'));
  click('[role=tab]', '喜欢');
  await tick();
  assert(document.body.textContent.includes('下一站'));
  assert(!document.body.textContent.includes('今天完成'));
  click('[role=tab]', '评论');
  await tick();
  assert(document.body.textContent.includes('一路顺风'));
  click('[role=tab]', '发布');
  await tick();
  snapshot('space-me');
  click('.space-bottom button', '世界');
  await tick();
  assert.equal(document.querySelectorAll('.moment-post').length, 3);
  snapshot('space-world');
  click('.space-bottom button', '发布');
  await tick();
  assert(document.querySelector('.moment-composer'));
  assert(space.back());
  await tick();
  click('.space-bottom button', '树洞');
  await tick();
  const day = treeHoleDay();
  assert.equal(dailyTopic(day, 'card'), dailyTopic(day, 'card'));
  phone.publishTreeHole('希望明天的自己，也能勇敢一点。');
  const holePost = phone.state.treeHole[day].posts[0];
  phone.commentTreeHole(day, holePost.id, '你已经做得很好了。');
  phone.likeTreeHole(day, holePost.id);
  await tick();
  assert(document.body.textContent.includes('匿名的我'));
  assert(holePost.liked);
  snapshot('space-hole');
  const oldZone = phone.activeSnapshot.zone;
  phone.settings.api.enabled = true;
  phone.settings.api.url = 'https://test.invalid/v1';
  phone.settings.api.apiurl = 'https://test.invalid/v1';
  phone.settings.api.model = 'test';
  phone.settings.api.key = 'test';
  phone.settings.api.retryCount = 0;
  global.generateRaw = async args => {
    assert.equal(args.max_chat_history, 0);
    assert(args.ordered_prompts.some(prompt => typeof prompt === 'object' && prompt.content.includes('匿名树洞')));
    return JSON.stringify({
      posts: [
        {
          id: 'generated',
          content: '今天听到一句很温柔的话。',
          comments: [{ id: 'reply', author: 'secret-name', content: '把温柔传下去。' }],
        },
      ],
    });
  };
  await phone.refreshTreeHole(day);
  assert.equal(phone.activeSnapshot.zone, oldZone);
  assert.equal(phone.state.treeHole[day].posts.length, 2);
  assert.equal(phone.state.treeHole[day].posts[1].comments[0].alias, '匿名回声 1');
  await phone.refreshTreeHole(day);
  assert.equal(phone.state.treeHole[day].posts.length, 2);
  global.generateRaw = async () => {
    chatKey = 'chat-B';
    return JSON.stringify({ posts: [{ id: 'stale', content: 'expired' }] });
  };
  await assert.rejects(phone.refreshTreeHole(day), /切换/);
  assert.equal(phone.state.treeHole[day].posts.length, 2);
  chatKey = 'chat-A';

  assert(phone.state.moments.posts.some(post => post.id === ownId));
  screen.value = 'messenger';
  await tick();
  assert.equal(document.querySelectorAll('.messenger-dock button').length, 3);
  click('.messenger-dock button', '我的');
  await tick();
  assert(!document.body.textContent.includes('朋友圈'));
  assert(!document.body.textContent.includes('空间互动'));
  assert(document.body.textContent.includes('我的钱包'));
  screen.value = 'settings';
  await tick();
  assert(document.querySelector('.cover-settings-card .wave-settings-title').textContent.includes('空间封面'));
  assert(document.body.textContent.includes('世界动态 · 参与者'));
  snapshot('space-settings');
  settingsApp.value = 'wallet';
  await tick();
  assert(document.querySelector('.cover-settings-card .wave-settings-title').textContent.includes('银行卡面'));
  console.log(
    'PASS: cross-chat complete wallet sharing, account/cover inheritance, idempotent replay, card isolation, legacy social migration, five tabs, profile filters, comments, composer, anonymous topic and messenger migration',
  );
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.unmount());
