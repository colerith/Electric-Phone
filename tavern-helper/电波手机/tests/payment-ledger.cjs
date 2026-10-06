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

const { repairThreadTime } = require(base + '/services/chat/repair-time.ts');
const { formatMessageDateTime } = require(base + '/services/core/message-clock.ts');
const storyTime = new Date(2027, 8, 25, 19, 41).toISOString();
const timed = { ...message, id: 'timed', payload: { amount: 50, packetType: 'group', count: 2, state: 'group_available', paymentLedgerVersion: 1 } };
thread.messages.push(timed);
applyPaymentActions(thread.messages, [{ message_id: 'timed', actor_key: 'alice', action: 'receive' }], ['alice'], true, storyTime);
assert.equal(timed.payload.claims[0].at, storyTime, 'AI receipt uses supplied phone time');
claimPayment(timed, 'user', storyTime);
syncPaymentLedger(book, [thread], identities, 'chat:test:');
const countBeforeRepair = accountRows(book, book.accounts.user).length;
const repairAt = new Date(2028, 1, 3, 12, 30).getTime();
repairThreadTime(thread, repairAt);
syncPaymentLedger(book, [thread], identities, 'chat:test:');
assert.equal(timed.payload.claims[0].at, timed.createdAt);
assert.equal(timed.payload.claims[1].at, timed.createdAt);
assert.equal(accountRows(book, book.accounts.user).length, countBeforeRepair, 'repair does not double-book receipts');
assert.equal(book.accounts.user.manual['chat:test:payment:alice:timed:user'].date, timed.createdAt);
assert.equal(book.accounts['char:alice'].manual['chat:test:payment:alice:timed:sent:alice'].date, timed.createdAt);
assert.equal(formatMessageDateTime(storyTime), '2027/09/25 19:41');
assert.equal(formatMessageDateTime('2027-09-25'), '2027/09/25');
console.log('PASS phone payment time, historic claim repair, existing ledger dates and local display format');
