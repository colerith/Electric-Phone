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
let vars = { script: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => 'test', characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');

const { usePhoneStore } = require(base + '/stores/phone.ts');
const accounts = require(base + '/services/wallet-accounts.ts');
const { WalletTransactionSchema } = require(base + '/services/wallet.ts');
const { serializeDelta } = require(base + '/services/module-protocol.ts');
const { buildModulePrompt } = require(base + '/prompts/index.ts');
const Workspace = require(base + '/components/WaveWalletWorkspace.vue').default;
const Messenger = require(base + '/components/WaveMessenger.vue').default;
let phone, messenger;
const screen = vue.ref('wallet'),
  mode = vue.ref('mine');
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    return () =>
      screen.value === 'wallet'
        ? vue.h(Workspace, { mode: mode.value })
        : vue.h(Messenger, { ref: v => (messenger = v), userName: 'User', userAvatar: '' });
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const click = (selector, text) => {
  const el = [...document.querySelectorAll(selector)].find(el => el.textContent.includes(text));
  assert(el, 'missing ' + text);
  el.click();
};
const input = (label, value) => {
  const el = document.querySelector('[aria-label="' + label + '"]');
  assert(el, label);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
async function select(label, text) {
  document.querySelector('button[aria-label="' + label + '"]').click();
  await tick();
  click('[role=option]', text);
  await tick();
}
const row = (id, amount, state = 'received') =>
  WalletTransactionSchema.parse({ id, title: '账目' + id, amount, direction: 'expense', state });
let floors = [];
global.getChatMessages = id => (typeof id === 'number' ? floors.filter(f => f.message_id === id) : floors);
(async () => {
  await phone.synchronize();
  await tick();
  const char = phone.activeIdentity.charKey,
    book = () => phone.state.walletBook;
  // Real form edits and ledger entry; subsequent bank edits must not roll back a changed balance.
  input('账户当前余额', '100');
  await tick();
  document
    .querySelector('.wallet-account-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(accounts.accountWallet(book(), book().accounts.user).balance, 100);
  assert.equal(document.querySelector('.wallet-page'), null);
  assert.equal(document.querySelector('[aria-label=剧情共享账户]'), null);
  mode.value = 'app';
  await tick();
  click('.wallet-tabs button', '记一笔');
  await tick();
  input('金额', '15');
  input('用途', '午餐');
  document.querySelector('.wallet-add-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(accounts.accountWallet(book(), book().accounts.user).balance, 85);
  mode.value = 'mine';
  await tick();
  const bank = document.querySelector('input[placeholder="例如：日常储蓄卡"]');
  bank.value = 'BANK-PRIVATE';
  bank.dispatchEvent(new Event('input', { bubbles: true }));
  document
    .querySelector('.wallet-account-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(accounts.accountWallet(book(), book().accounts.user).balance, 85);
  await phone.synchronize();
  assert.equal(accounts.accountWallet(book(), book().accounts.user).balance, 85);
  // Currency change has a separate balance and restores the old currency intact.
  await select('账户币种', 'USD');
  assert.equal(document.querySelector('[aria-label="账户当前余额"]').value, '');
  input('账户当前余额', '20');
  document
    .querySelector('.wallet-account-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(accounts.accountWallet(book(), book().accounts.user).balance, 20);
  assert.equal(accounts.accountWallet(book(), book().accounts.user).transactions.length, 0);
  await select('账户币种', 'CNY');
  document
    .querySelector('.wallet-account-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(accounts.accountWallet(book(), book().accounts.user).balance, 85);
  // Shared accounts are the exact same object from My Wallet and the wallet app.
  mode.value = 'settings';
  await tick();
  click('button', '新增共享账户');
  await tick();
  const shared = Object.values(book().accounts).find(a => a.ownerType === 'shared').id;
  input('账户当前余额', '200');
  document
    .querySelector('.wallet-account-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  await select('剧情共享账户', '共同生活账户');
  assert.equal(book().selectedShared[char], shared);
  phone.addWalletTransaction(row('manual-shared', 10), shared);
  await tick();
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 190);
  mode.value = 'app';
  await tick();
  await select('选择钱包账户', '共享');
  assert(document.querySelector('.wallet-overview').textContent.includes('190.00'));
  const categoryIcon = document.querySelector('.wallet-category-icon');
  assert(categoryIcon.style.color);
  assert(categoryIcon.style.background);
  click('.wallet-tabs button', '分类统计');
  await tick();
  assert(document.querySelector('.wallet-donut-chart'));
  assert(document.querySelector('.wallet-donut-total').textContent.includes('10.00'));
  assert(document.querySelector('.wallet-donut-label text').textContent.includes('100.0%'));
  // ID deduplication and pending -> received -> refunded modify one entry only.
  const grant = accounts.walletAuthorization(book(), char);
  const patch = state => ({ ...grant, transactions: [row('model-shared', 30, state)] });
  assert.equal(accounts.applyWalletPatch(book(), { ...grant, transactions: [] }, grant, 'test:empty'), false);
  assert.equal(accounts.applyWalletPatch(book(), patch('pending'), grant, 'test:1'), true);
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 190);
  assert.equal(accounts.applyWalletPatch(book(), patch('received'), grant, 'test:2'), true);
  assert.equal(accounts.applyWalletPatch(book(), patch('received'), grant, 'test:2'), false);
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 160);
  accounts.applyWalletPatch(book(), patch('refunded'), grant, 'test:3');
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 190);
  assert.equal(accounts.accountRows(book(), book().accounts[shared]).filter(r => r.id === 'model-shared').length, 1);
  accounts.applyWalletPatch(
    book(),
    { ...grant, balance: 999, bankName: 'ATTACK', transactions: [row('manual-shared', 999)] },
    grant,
    'test:4',
  );
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 190);
  assert.throws(() =>
    accounts.applyWalletPatch(
      book(),
      { ...grant, accountId: 'user', ownerType: 'user', ownerId: 'user' },
      grant,
      'bad',
    ),
  );
  assert.throws(() =>
    accounts.applyWalletPatch(book(), { ...grant, currency: 'USD', transactions: [row('bad', 20)] }, grant, 'bad'),
  );
  assert.equal(book().accounts.user.bankName, 'BANK-PRIVATE');
  // Replay a shared floor, then deselect: history keeps its original grant and is not rerouted.
  const delta = {
    version: 1,
    char_id: phone.activeIdentity.stableId || char,
    char_name: phone.activeIdentity.name,
    messages: [],
    app_updates: { wallet: { ...grant, transactions: [row('floor-shared', 5)] } },
  };
  phone.saveWalletAccount(shared, {
    name: '共同生活账户',
    currency: 'CNY',
    balance: 190,
    bankName: '',
    cardLabel: '',
    cardLastFour: '',
  });
  floors = [{ message_id: 0, role: 'assistant', message: serializeDelta(delta) }];
  await phone.synchronize();
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 185);
  assert.equal(phone.walletSelectedAccountId, shared);
  phone.selectSharedWallet('');
  await phone.synchronize();
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 185);
  floors = [];
  await phone.synchronize();
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 190);
  // A second character has no access to the first character's shared account.
  const bob = phone.addContact('Bob', '朋友');
  phone.startConversation(bob);
  assert.throws(() => phone.selectSharedWallet(shared));
  phone.startConversation(char);
  phone.selectSharedWallet(shared);
  const context = {
    cardKey: phone.context.cardKey,
    chatKey: phone.context.chatKey,
    cardName: 'Alice',
    identity: phone.activeIdentity,
    thread: phone.activeThread,
    appSnapshot: {
      ...phone.activeSnapshot,
      wallet: JSON.stringify(accounts.accountWallet(book(), book().accounts[shared])),
    },
    availableStickers: '',
    walletAuthorization: accounts.walletAuthorization(book(), char),
  };
  for (const follow of [true, false]) {
    const prompt = buildModulePrompt(context, ['wallet'], follow);
    assert(prompt.includes(shared));
    assert(prompt.includes('"ownerType":"shared"'));
    assert(prompt.includes('balance'));
    assert(prompt.includes('不得省略 balance'));
    assert(prompt.includes('transactions:[]'));
    assert(!prompt.includes('BANK-PRIVATE'));
  }
  // Actual manual generation stays bound to the selected account even if selection changes while waiting.
  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://test.invalid/v1';
  phone.settings.api.model = 'test';
  phone.settings.api.maxRetries = 0;
  global.getTavernRegexes = () => [];
  global.updateTavernRegexesWith = async fn => fn([]);
  global.createChatMessages = async rows => rows.forEach(row => floors.push({ ...row, message_id: floors.length + 1 }));
  global.generateRaw = async args => {
    assert(args.ordered_prompts.some(p => p.content?.includes(shared)));
    phone.selectSharedWallet('');
    return JSON.stringify({
      ...delta,
      app_updates: { wallet: { ...grant, transactions: [row('manual-generated', 7)] } },
    });
  };
  await phone.generateModule('wallet');
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 183);
  await phone.synchronize();
  assert.equal(accounts.accountWallet(book(), book().accounts[shared]).balance, 183);
  // Follow sanitization drops attempts to target User and removes bank fields from valid output.
  const { constrainPhoneFloor } = require(base + '/services/follow-generation.ts');
  const { ModuleSettingsSchema } = require(base + '/services/module-settings.ts');
  const malicious = serializeDelta({
    ...delta,
    app_updates: {
      wallet: { ...grant, accountId: 'user', ownerType: 'user', ownerId: 'user', balance: 9999, transactions: [] },
    },
  });
  assert(
    !constrainPhoneFloor(
      malicious,
      ModuleSettingsSchema.parse({}),
      delta.char_id,
      phone.activeSnapshot,
      grant,
    ).includes('"wallet"'),
  );
  const clean = constrainPhoneFloor(
    serializeDelta({
      ...delta,
      app_updates: { wallet: { ...grant, bankName: 'SECRET-BANK', transactions: [row('clean', 1)] } },
    }),
    ModuleSettingsSchema.parse({}),
    delta.char_id,
    phone.activeSnapshot,
    grant,
  );
  assert(!clean.includes('SECRET-BANK'));
  assert(clean.includes(shared));
  // My Wallet is a real child route with the dock hidden and the parent back handler.
  screen.value = 'messenger';
  await tick();
  click('.messenger-dock button', '我的');
  await tick();
  click('.moments-me-menu button', '我的钱包');
  await tick();
  assert.equal(messenger.headerTitle, '我的钱包');
  assert.equal(document.querySelector('.messenger-bottom'), null);
  assert.equal(messenger.handleBack(), true);
  await tick();
  assert.equal(messenger.headerTitle, '我的');
  assert(document.querySelector('.messenger-dock'));
  // Upgrade a pre-ledger manual account without losing its entered balance or transactions.
  floors = [];
  const saved = vars.chat.wave_phone_chat;
  delete saved.walletBook;
  saved.snapshots[char] = {
    ...saved.snapshots[char],
    sourceMessageIds: [],
    wallet: JSON.stringify({ currency: 'CNY', balance: 75, transactions: [row('manual-old', 25)] }),
  };
  await phone.synchronize();
  const migrated = book().accounts['char:' + char];
  assert.equal(accounts.accountWallet(book(), migrated).balance, 75);
  assert(migrated.manual['manual-old']);
  await phone.synchronize();
  assert.equal(accounts.accountWallet(book(), book().accounts['char:' + char]).balance, 75);
  app.unmount();
  console.log(
    'PASS: wallet form/navigation, shared ledger, manual persistence, per-currency balances, payment-state deduplication, protected user/bank data, role authorization, floor replay/removal, and captured manual request scope.',
  );
})().catch(error => {
  console.error(error);
  app.unmount();
  process.exitCode = 1;
});
