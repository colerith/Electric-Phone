const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
const base = process.cwd() + '/src/util/酒馆助手脚本/电波手机';
const { WalletBookSchema, ensureWalletAccounts, accountRows } = require(base + '/services/wallet/wallet-accounts.ts');
const { syncPaymentLedger } = require(base + '/services/chat/payment-ledger.ts');
const { applyPaymentActions, claimPayment } = require(base + '/services/chat/payment.ts');
const book = WalletBookSchema.parse({});
ensureWalletAccounts(book, 'alice', 'Alice');
book.accounts['char:alice'].currency = 'GBP';
const identities = {
  alice: { actorType: 'main', source: 'auto_single_card' },
  npc: { actorType: 'npc', source: 'local_contact' },
};
const message = {
  id: 'packet',
  sender: 'char',
  type: 'red_packet',
  status: 'sent',
  createdAt: '2026-10-06',
  payload: { amount: 100, packetType: 'private', state: 'pending', paymentLedgerVersion: 1 },
};
const thread = { charKey: 'alice', messages: [message] };
syncPaymentLedger(book, [thread], identities, 'chat:test:');
assert.equal(message.payload.currency, 'GBP');
assert.equal(accountRows(book, book.accounts['char:alice'])[0].direction, 'expense');
claimPayment(message, 'user');
syncPaymentLedger(book, [thread], identities, 'chat:test:');
syncPaymentLedger(book, [thread], identities, 'chat:test:');
assert.equal(accountRows(book, book.accounts.user).length, 1);
assert.equal(accountRows(book, book.accounts.user)[0].amount, 100);
assert.equal(accountRows(book, book.accounts['char:alice']).length, 1);
const transfer = {
  id: 'transfer',
  sender: 'user',
  type: 'transfer',
  status: 'sent',
  createdAt: '2026-10-06',
  payload: { amount: 25, currency: 'GBP', state: 'pending', paymentLedgerVersion: 1 },
};
thread.messages.push(transfer);
applyPaymentActions(thread.messages, [{ message_id: 'transfer', action: 'refund' }], ['alice']);
syncPaymentLedger(book, [thread], identities, 'chat:test:');
const userRows = accountRows(book, book.accounts.user);
assert.equal(userRows.filter(r => r.direction === 'expense').length, 1);
assert.equal(userRows.filter(r => r.title === '退回转账').length, 1);
const received = {
  ...transfer,
  id: 'received',
  payload: { amount: 12, currency: 'GBP', state: 'pending', paymentLedgerVersion: 1 },
};
thread.messages.push(received);
applyPaymentActions(thread.messages, [{ message_id: 'received', action: 'receive' }], ['alice']);
syncPaymentLedger(book, [thread], identities, 'chat:test:');
assert(accountRows(book, book.accounts['char:alice']).some(r => r.direction === 'income' && r.amount === 12));
const npc = { ...message, id: 'npc', payload: { amount: 10, state: 'pending', paymentLedgerVersion: 1 } };
syncPaymentLedger(book, [{ charKey: 'npc', messages: [npc] }], identities, 'chat:test:');
assert(!book.accounts['char:npc']);
console.log('PASS payment expenses, income, refund, currency, idempotence and no NPC wallet creation');
