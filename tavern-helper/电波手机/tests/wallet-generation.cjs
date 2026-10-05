const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>');
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement']) global[key] = dom.window[key];
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
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const a = require(base + '/services/wallet/wallet-accounts.ts');
const w = require(base + '/services/wallet/wallet.ts');
const { createApp, h, nextTick } = require('vue');
const Panel = require(base + '/components/wallet/WaveWalletPanel.vue').default;
const book = a.WalletBookSchema.parse({});
a.ensureWalletAccounts(book, 'alice', 'Alice');
const grant = a.walletAuthorization(book, 'alice'),
  account = book.accounts[grant.accountId];
assert.throws(() => a.validateWalletPatch({ ...grant, balance: null }, grant, true), /首次生成必须补全/);
assert.equal(a.validateWalletPatch({ ...grant, balance: 0 }, grant, true).balance, 0);
const row = (id, amount, direction = 'income') => ({
  id,
  title: id,
  amount,
  direction,
  category: direction === 'income' ? '工资' : '餐饮',
});
const patch = (layer, fields) => a.applyWalletPatch(book, { ...grant, ...fields }, grant, layer);
patch('older', { transactions: [row('old-income', 100), row('old-expense', 20, 'expense')] });
account.manual.manual = a.AccountRowSchema.parse({ ...row('manual', 5, 'expense'), currency: 'CNY' });
account.opening.CNY = null;
patch('newer', { balance: '1,250.50', transactions: [{ ...row('salary', '200.50'), direction: '收入' }] });
assert.equal(a.accountWallet(book, account).balance, 1250.5, 'reconcile all previous and manual entries');
patch('newer', { balance: '1,250.50', transactions: [row('salary', '200.50')] });
assert.equal(a.accountWallet(book, account).balance, 1250.5, 'same layer must not double count');
patch('third', { balance: 999999, transactions: [row('bonus', 25)] });
assert.equal(a.accountWallet(book, account).balance, 1275.5, 'known balance follows ledger, not model snapshot');
for (const balance of [0, -12.5]) {
  const fresh = a.WalletBookSchema.parse({});
  a.ensureWalletAccounts(fresh, 'alice', 'Alice');
  a.applyWalletPatch(fresh, { ...grant, balance, transactions: [] }, grant, 'first');
  assert.equal(a.accountWallet(fresh, fresh.accounts[grant.accountId]).balance, balance);
}
for (const amount of ['', ' ', true, '12,34', Infinity, -1])
  assert(!w.WalletTransactionSchema.safeParse(row('invalid', amount)).success);
const raw = w.mergeWallet('', {
  balance: '80',
  transactions: [
    { ...row('工资到账', '100'), direction: '收入' },
    { ...row('午餐', '20', 'expense'), direction: '支出' },
    { ...row('待收款', '50'), state: 'pending' },
  ],
});
assert.deepEqual(w.walletTotals(w.parseWallet(raw).transactions), { income: 100, expense: 20 });
const app = createApp({ render: () => h(Panel, { raw, name: 'Alice', artwork: '' }) });
app.mount('#app');
const click = (selector, label) => {
  const button = [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === label);
  assert(button, label);
  button.click();
};
(async () => {
  assert.equal(document.querySelectorAll('.wallet-record').length, 3);
  assert(document.querySelector('.wallet-record .income').textContent.includes('+'));
  click('.wallet-direction-filter button', '收入');
  await nextTick();
  assert.equal(document.querySelectorAll('.wallet-record').length, 2);
  assert(![...document.querySelectorAll('.wallet-record')].some(el => el.textContent.includes('午餐')));
  click('.wallet-tabs button', '分类统计');
  await nextTick();
  assert(document.querySelector('.wallet-donut-chart').getAttribute('aria-label').includes('总收入 100.00'));
  assert(document.querySelector('.wallet-pie-legend').textContent.includes('工资'));
  click('.wallet-direction-filter button', '支出');
  await nextTick();
  assert(document.querySelector('.wallet-donut-chart').getAttribute('aria-label').includes('总支出 20.00'));
  console.log(
    'PASS: generated balance initialization, full-ledger reconciliation, idempotence, numeric/Chinese income compatibility, income list and statistics.',
  );
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.unmount());
