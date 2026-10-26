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
const accounts = require(base + '/services/wallet/wallet-accounts.ts');
const { WalletTransactionSchema } = require(base + '/services/wallet/wallet.ts');
const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
const { buildModulePrompt } = require(base + '/prompts/index.ts');
const Workspace = require(base + '/components/wallet/WaveWalletWorkspace.vue').default;
const Messenger = require(base + '/components/chat/WaveMessenger.vue').default;
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
  input('账户当前余额', '100');
  await tick();
  document
    .querySelector('.wallet-account-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  phone.addWalletTransaction(row('old-cny', 15), 'user');
  await tick();
  await select('账户币种', 'JPY');
  await tick();
  assert(document.querySelector('.wallet-currency-migration'));
  click('button', '一键迁移至 JPY');
  await tick();
  await tick();
  const wallet = accounts.accountWallet(phone.state.walletBook, phone.state.walletBook.accounts.user);
  assert.equal(wallet.currency, 'JPY');
  assert.equal(wallet.balance, 85);
  assert.equal(wallet.transactions.length, 1);
  assert.equal(wallet.transactions[0].amount, 15);
  assert(document.body.textContent.includes('已迁移 1 条流水'));
  assert(!document.querySelector('.wallet-currency-migration'));
  await phone.synchronize();
  await tick();
  assert.equal(accounts.accountWallet(phone.state.walletBook, phone.state.walletBook.accounts.user).balance, 85);
  app.unmount();
  dom.window.close();
  console.log('PASS actual wallet settings selector and one-click migration, balance, feedback and reload');
})().catch(error => {
  console.error(error);
  app.unmount();
  dom.window.close();
  process.exitCode = 1;
});
