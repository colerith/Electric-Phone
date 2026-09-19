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
  const device = surface.value.cloneNode(true);
  device.className =
    'wave-device page-zone is-subpage theme-light' +
    (document.querySelector('.moment-composer') ? ' space-composing' : '');
  const main = document.createElement('main');
  main.className = 'wave-screen';
  main.append(device.firstChild);
  const overlays = [...device.childNodes];
  device.innerHTML =
    '<div class="wave-statusbar"><span>21:26</span><span>● ▰ 100%</span></div><header class="wave-appbar"><button>‹</button><strong>空间</strong><button>☰</button></header>';
  device.append(main, ...overlays);
  device.insertAdjacentHTML('beforeend', '<button class="wave-homebar"><span></span></button>');
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
      `<div id="wave-phone-script-root"><div class="wave-phone-host">${device.outerHTML}</div></div>`,
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
    profile: {
      username: 'Ghost',
      handle: 'cipher_vector_0',
      title: '离线终端',
      titleColor: '#6085bc',
      badges: ['laptop', 'headphone', 'crescent-moon'],
      signature: '在平凡的日子里收集微光。',
    },
    posts: [
      {
        id: 'old',
        content: '阳光落在窗台上，今天也是值得记住的一天。',
        date: '2026-09-19',
        comments: [
          {
            id: 'c1',
            author: 'Alice',
            content: 'Welcome to my space',
            translation: { language: '中文', content: '欢迎来我的空间' },
            createdAt: '2026-09-19T09:00:00',
          },
        ],
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
  phone.settings.moduleSettings.zone.autoTranslate = true;
  phone.settings.moduleSettings.zone.syncChat = false;
  phone.settings.moduleSettings.zone.expandTranslation = true;
  await tick();
  assert(phone.momentsFeed.comments.find(item => item.postId === legacy).translation.content === '欢迎来我的空间');
  assert(document.querySelector('.space-comment .space-inline-translation'));
  assert(!document.querySelector('.space-comment details'));
  assert.equal(document.querySelectorAll('.space-decorations img').length, 3);
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
  click('.moments-me-menu button', '编辑资料');
  await tick();
  const field = label =>
    [...document.querySelectorAll('label')].find(el => el.textContent.trim() === label).querySelector('input');
  for (const [label, value] of [
    ['账号', '@Echo'],
    ['个人称号', '虚无'],
  ]) {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.querySelector('.space-title-palette [aria-label="晴空蓝"]').click();
  await tick();
  assert.equal(document.querySelector('.space-title-badge').style.color, 'rgb(255, 255, 255)');
  for (let i = 0; i < 4; i++) {
    document.querySelectorAll('.space-badge-grid button')[i].click();
    await tick();
  }
  assert(document.querySelectorAll('.space-badge-grid button')[4].disabled);
  assert.equal(document.querySelectorAll('.space-badge-group').length, 8);
  assert.equal(document.querySelectorAll('.space-badge-categories').length, 0);
  assert.equal(document.querySelectorAll('.space-badge-group h3').length, 0);
  assert.equal(document.querySelectorAll('.space-badge-group .wave-settings-title').length, 8);
  const previousAlias = document.querySelector('.space-anonymous-preview strong').textContent;
  const previousAvatar = document.querySelector('.space-anonymous-preview img').src;
  click('.space-anonymous-randomizers button', '随机匿名 ID');
  click('.space-anonymous-randomizers button', '随机头像');
  await tick();
  assert.notEqual(document.querySelector('.space-anonymous-preview strong').textContent, previousAlias);
  assert.notEqual(document.querySelector('.space-anonymous-preview img').src, previousAvatar);
  assert.equal(document.querySelectorAll('.space-anonymous-profile input').length, 0);
  snapshot('space-profile-edit');
  click('button', '保存资料');
  await tick();
  assert.equal(phone.state.moments.profile.badges.length, 4);
  assert.equal(phone.state.moments.profile.title, '虚无');
  assert.equal(phone.state.moments.profile.titleColor, '#69b9d9');
  assert(document.querySelector('.moments-me-profile small').textContent === '@Echo');
  snapshot('space-me');
  click('.space-bottom button', '世界');
  await tick();
  assert.equal(document.querySelectorAll('.moment-post').length, 3);
  snapshot('space-world');
  click('.space-bottom button', '发布');
  await tick();
  assert(document.querySelector('.moment-composer'));
  assert(space.isComposing);
  const tagInput = document.querySelector('#wave-post-tag');
  const add = async (tag, composing = false) => {
    tagInput.value = tag;
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    tagInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: composing, bubbles: true, cancelable: true }),
    );
    await tick();
  };
  await add('旅行', true);
  assert.equal(document.querySelectorAll('.space-tag-editor .space-post-tags button').length, 0);
  await add('#旅行');
  await add('旅行');
  await add('日常');
  assert.equal(document.querySelectorAll('.space-tag-editor .space-post-tags button').length, 2);
  document.querySelector('[aria-label="删除标签 日常"]').click();
  await tick();
  const text = document.querySelector('[aria-label="空间动态文本"]');
  text.value = '带着好奇心出发';
  text.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  snapshot('space-compose');
  click('button', '发表');
  await tick();
  assert.deepEqual([...phone.state.moments.posts[0].tags], ['旅行']);
  assert(document.querySelector('.space-post-tags').textContent.includes('#旅行'));
  snapshot('space-tags');
  const toDelete = phone.state.moments.posts[0].id;
  document.querySelector('[aria-label="删除空间动态"]').click();
  await tick();
  assert(document.querySelector('[role="alertdialog"]'));
  assert.equal(document.activeElement.textContent, '取消');
  assert(phone.state.moments.posts.some(post => post.id === toDelete));
  click('.space-delete-dialog button', '取消');
  await tick();
  assert(phone.state.moments.posts.some(post => post.id === toDelete));
  document.querySelector('[aria-label="删除空间动态"]').click();
  await tick();
  snapshot('space-delete');
  click('.space-delete-dialog button', '确认删除');
  await tick();
  assert(!phone.state.moments.posts.some(post => post.id === toDelete));
  assert(!space.isComposing);
  click('.space-bottom button', '发布');
  await tick();
  assert.equal(document.querySelectorAll('.space-tag-editor .space-post-tags button').length, 0);
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
  assert(document.body.textContent.includes(phone.state.moments.profile.anonymousId));
  assert(!document.querySelector('.space-hole-post .space-post-account'));
  assert(document.querySelector('.space-hole-actions time'));
  assert(holePost.comments[0].mine);
  assert(holePost.liked);
  const savedAlias = phone.state.moments.profile.anonymousId;
  const savedSeed = phone.state.moments.profile.anonymousAvatarSeed;
  phone.ensureAnonymousProfile();
  assert.equal(phone.state.moments.profile.anonymousId, savedAlias);
  assert.equal(phone.state.moments.profile.anonymousAvatarSeed, savedSeed);
  holePost.comments[0].mine = undefined;
  holePost.comments[0].alias = '匿名的我';
  await tick();
  assert(!document.querySelector('.space-hole-post').textContent.includes('匿名的我'));
  const anonymousImages = [...document.querySelectorAll('.space-anonymous-avatar img')];
  assert(anonymousImages.length >= 2);
  assert(anonymousImages.every(img => img.src.includes('/10.x/bottts-neutral/svg?seed=wave-hole-')));
  assert.equal(anonymousImages[0].src, anonymousImages[1].src);
  snapshot('space-hole');
  phone.publishTreeHole('可以删除的测试动态');
  await tick();
  const removable = phone.state.treeHole[day].posts.at(-1).id;
  document.querySelector('[aria-label="删除匿名动态"]').click();
  await tick();
  assert(document.querySelector('[role="alertdialog"]'));
  assert.equal(document.activeElement.textContent, '取消');
  click('.space-delete-dialog button', '取消');
  await tick();
  assert(phone.state.treeHole[day].posts.some(post => post.id === removable));
  document.querySelector('[aria-label="删除匿名动态"]').click();
  await tick();
  click('.space-delete-dialog button', '确认删除');
  await tick();
  assert(!phone.state.treeHole[day].posts.some(post => post.id === removable));
  assert(phone.state.treeHole[day].posts.some(post => post.id === holePost.id));
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
          translation: { language: 'English', content: 'I heard something kind today.' },
          comments: [
            {
              id: 'reply',
              author: 'secret-name',
              content: '把温柔传下去。',
              translation: { language: 'English', content: 'Pass it on.' },
            },
          ],
        },
      ],
    });
  };
  await phone.refreshTreeHole(day);
  assert.equal(phone.activeSnapshot.zone, oldZone);
  assert.equal(phone.state.treeHole[day].posts.length, 2);
  assert.equal(phone.state.treeHole[day].posts[1].comments[0].alias, '匿名回声 1');
  assert(!phone.state.treeHole[day].posts[1].comments[0].mine);
  await tick();
  assert(document.querySelector('.space-hole').textContent.includes('匿名回声 1'));
  assert.equal(phone.state.treeHole[day].posts[1].comments[0].translation.content, 'Pass it on.');
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
  chatKey = 'chat-B';
  await phone.synchronize();
  assert.equal(phone.state.moments.profile.anonymousId, savedAlias);
  assert.equal(phone.state.moments.profile.anonymousAvatarSeed, savedSeed);
  console.log(
    'PASS: cross-chat complete wallet sharing, account/cover inheritance, idempotent replay, card isolation, legacy social migration, five tabs, profile filters, comments, composer, anonymous topic and messenger migration',
  );
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.unmount());
