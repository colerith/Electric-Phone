const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const a = require(base + '/services/wallet/wallet-accounts.ts');
const book = a.WalletBookSchema.parse({});
a.ensureWalletAccounts(book, 'alice', 'Alice');
const id = 'char:alice',
  grant = { accountId: id, ownerType: 'char', ownerId: 'alice', currency: 'CNY' };
const update = {
  currency: 'CNY',
  balance: 100,
  transactions: [
    { id: 'old', direction: 'expense', amount: 10, title: '午餐', date: '2026-10-25', status: 'confirmed' },
  ],
};
book.grants.floor = grant;
a.applyWalletPatch(book, update, grant, 'floor');
book.accounts[id].opening.JPY = 20;
const before = JSON.stringify(book.accounts.user);
assert.equal(a.migrateAccountCurrency(book, id, 'CNY', 'JPY'), 1);
assert.equal(a.accountWallet(book, book.accounts[id]).balance, 120);
assert.equal(a.accountRows(book, book.accounts[id])[0].currency, 'JPY');
assert.equal(a.accountRows(book, book.accounts[id])[0].amount, 10);
assert(book.accounts[id].currencyMigrationBackup);
assert.equal(JSON.stringify(book.accounts.user), before);
assert.throws(() => a.migrateAccountCurrency(book, id, 'CNY', 'JPY'));
book.accounts[id].layers = {};
a.applyWalletPatch(book, update, grant, 'floor');
assert.equal(a.accountWallet(book, book.accounts[id]).balance, 120);
assert.equal(a.accountRows(book, book.accounts[id])[0].currency, 'JPY');
assert(!Object.hasOwn(book.accounts[id].opening, 'CNY'));
const reloaded = a.WalletBookSchema.parse(JSON.parse(JSON.stringify(book)));
a.migrateAccountCurrency(reloaded, id, 'JPY', 'USD');
reloaded.accounts[id].layers = {};
a.applyWalletPatch(reloaded, update, grant, 'floor');
assert.equal(a.accountRows(reloaded, reloaded.accounts[id])[0].currency, 'USD');
assert.equal(a.accountWallet(reloaded, reloaded.accounts[id]).balance, 120);
assert(!Object.hasOwn(reloaded.accounts[id].opening, 'CNY'));
console.log(
  'PASS wallet currency migration preserves amounts and other accounts, persists, and survives old-floor replay and subsequent migration',
);
