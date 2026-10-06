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
let chatId = 'test';
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chatId, characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getWorldbookNames: () => ['其他世界书', '角色设定'],
  getCharWorldbookNames: () => ({ primary: '角色设定', additional: [] }),
  getWorldbook: async () => [{ uid: 7, name: 'Dora', content: '世界书角色资料'.repeat(200) }],
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const Message = require(base + '/components/chat/WaveMessageContent.vue').default;
const { PhoneMessageSchema } = require(base + '/schemas.ts');
const { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
let phone;
const selected = vue.ref('');
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    const surface = vue.ref(null);
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h(
        'section',
        { ref: surface },
        [phone.activeThread?.messages.find(m => m.id === selected.value)]
          .filter(Boolean)
          .map(message => vue.h(Message, { message })),
      );
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
function add(id, type, payload = {}, sender = 'char') {
  phone.activeThread.messages.push(
    PhoneMessageSchema.parse({
      id,
      type,
      sender,
      content: '给你的心意',
      createdAt: new Date().toISOString(),
      payload: { amount: 88, currency: 'CNY', state: 'pending', ...payload },
    }),
  );
  selected.value = id;
}
function click(text) {
  const button = [...document.querySelectorAll('.wave-payment-dialog button')].find(item =>
    item.textContent.includes(text),
  );
  assert(button, 'missing payment action: ' + text);
  button.click();
}
(async () => {
  await phone.synchronize();
  add('packet', 'red_packet');
  await tick();
  document.querySelector('.wave-message-red-packet').click();
  await tick();
  assert(document.querySelector('[role=dialog]'));
  assert(document.querySelector('.wave-payment-dialog').textContent.includes('88.00'));
  phone.settings.basic.systemClock.source = 'custom';
  phone.settings.basic.systemClock.customTime = '2027-09-25T19:41';
  phone.settings.basic.systemClock.customRunning = false;
  phone.setDraft('保留草稿');
  click('领取红包');
  await tick();
  assert(document.querySelector('.payment-status').textContent.includes('已收款'));
  const receiptAt = phone.activeThread.messages.find(m => m.id === 'packet').payload.claims[0].at;
  assert.equal(new Date(receiptAt).getFullYear(), 2027, 'user claim follows phone clock');
  assert.equal(new Date(receiptAt).getHours(), 19);
  assert(!document.querySelector('.payment-actions'));
  assert.equal(phone.activeThread.draft, '保留草稿');
  assert.equal(Object.values(phone.state.walletBook.accounts.user.manual).length, 1);
  assert.equal(Object.values(phone.state.walletBook.accounts.user.manual)[0].amount, 88);
  assert.throws(() => phone.respondToPayment(phone.activeThread.id, 'packet', 'received'), /已处理/);
  assert.equal(phone.activeThread.messages.filter(m => m.payload.interaction === 'payment_receipt').length, 1);
  document.querySelector('[aria-label="关闭收款详情"]').click();
  await tick();
  assert.equal(document.querySelector('[role=dialog]'), null, 'close button must not reopen the payment dialog');
  await phone.synchronize();
  assert.equal(phone.activeThread.messages.find(m => m.id === 'packet').payload.userPaymentDecision, 'received');
  assert.equal(Object.values(phone.state.walletBook.accounts.user.manual).length, 1);
  add('transfer', 'transfer');
  await tick();
  document
    .querySelector('.wave-message-transfer')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
  click('拒收并退回');
  await tick();
  assert.equal(phone.activeThread.messages.find(m => m.id === 'transfer').payload.state, 'refunded');
  assert.equal(Object.values(phone.state.walletBook.accounts.user.manual).length, 1);
  assert(document.querySelector('.payment-status').textContent.includes('已拒收'));
  document.querySelector('[aria-label="关闭收款详情"]').click();
  await tick();
  add('accepted-transfer', 'transfer', { amount: 12.5 });
  phone.respondToPayment(phone.activeThread.id, 'accepted-transfer', 'received');
  assert.equal(Object.values(phone.state.walletBook.accounts.user.manual).length, 2);
  add('forward', 'transfer', { forwarded: true });
  assert.throws(() => phone.respondToPayment(phone.activeThread.id, 'forward', 'received'), /不能由你/);
  add('own', 'red_packet', {}, 'user');
  assert.throws(() => phone.respondToPayment(phone.activeThread.id, 'own', 'received'), /不能由你/);
  add('bad', 'red_packet', { amount: -1 });
  assert.throws(() => phone.respondToPayment(phone.activeThread.id, 'bad', 'received'), /金额无效/);
  add('group', 'red_packet', {
    packetType: 'group',
    count: 3,
    claimedCount: 1,
    claimedAmount: 20,
    amount: 100,
    state: 'group_claimed',
  });
  phone.respondToPayment(phone.activeThread.id, 'group', 'received');
  const group = phone.activeThread.messages.find(m => m.id === 'group');
  assert(group.payload.userReceivedAmount > 0 && group.payload.userReceivedAmount < 80);
  assert.equal(group.payload.claimedCount, 2);
  assert.equal(group.payload.claimedAmount, Math.round((20 + group.payload.userReceivedAmount) * 100) / 100);
  assert.throws(() => phone.respondToPayment(phone.activeThread.id, 'group', 'received'), /已处理/);
  add('group-refuse', 'red_packet', { packetType: 'group', count: 3, state: 'group_available' });
  phone.respondToPayment(phone.activeThread.id, 'group-refuse', 'refunded');
  assert.equal(phone.activeThread.messages.find(m => m.id === 'group-refuse').payload.state, 'group_available');
  const { applyPaymentActions, paymentClaims } = require(base + '/services/chat/payment.ts');
  add('ai-private', 'red_packet', { amount: 20 }, 'user');
  const privatePacket = phone.activeThread.messages.find(m => m.id === 'ai-private');
  applyPaymentActions(
    phone.activeThread.messages,
    [{ message_id: 'ai-private', actor_key: 'alice', action: 'receive' }],
    ['alice'],
  );
  assert.equal(privatePacket.payload.state, 'received');
  assert.equal(paymentClaims(privatePacket)[0].amount, 20);
  applyPaymentActions(
    phone.activeThread.messages,
    [{ message_id: 'ai-private', actor_key: 'alice', action: 'receive' }],
    ['alice'],
  );
  assert.equal(paymentClaims(privatePacket).length, 1);
  add(
    'ai-group',
    'red_packet',
    { amount: 1, packetType: 'group', count: 3, claimedCount: 0, state: 'group_available' },
    'user',
  );
  const aiGroup = phone.activeThread.messages.find(m => m.id === 'ai-group');
  const actions = ['alice', 'bob', 'carl', 'outsider', 'user'].map(actor_key => ({
    message_id: 'ai-group',
    actor_key,
    action: 'receive',
  }));
  applyPaymentActions(phone.activeThread.messages, actions, ['alice', 'bob', 'carl'], true);
  assert.equal(aiGroup.payload.state, 'group_empty');
  assert.equal(aiGroup.payload.claimedAmount, 1);
  assert.equal(paymentClaims(aiGroup).length, 3);
  assert(paymentClaims(aiGroup).every(c => c.amount >= 0.01));
  applyPaymentActions(phone.activeThread.messages, actions, ['alice', 'bob', 'carl'], true);
  assert.equal(paymentClaims(aiGroup).length, 3);
  await tick();
  let exhaustedCard = [...document.querySelectorAll('.wave-message-red-packet')].at(-1);
  assert(exhaustedCard.classList.contains('red-packet-group_empty'));
  // Historical packets may keep their available state after all shares were claimed.
  aiGroup.payload.state = 'group_available';
  aiGroup.payload.userPaymentDecision = 'received';
  await tick();
  exhaustedCard = [...document.querySelectorAll('.wave-message-red-packet')].at(-1);
  assert(exhaustedCard.classList.contains('red-packet-group_empty'));
  assert(exhaustedCard.textContent.includes('已抢完 3/3'));
  const ownCards = [...document.querySelectorAll('.wave-message-red-packet')];
  ownCards.at(-1).click();
  await tick();
  assert(document.querySelector('[role=dialog]'), 'own group packets open details');
  assert.equal(document.querySelectorAll('.payment-claim').length, 3);
  assert(document.querySelector('.payment-best').textContent.includes('手气之王'));
  document.querySelector('[aria-label="关闭收款详情"]').click();
  await tick();
  phone.setDraft('保存领取记录');
  await phone.synchronize();
  assert.equal(
    paymentClaims(phone.activeThread.messages.find(m => m.id === 'ai-group')).length,
    3,
    'claims survive synchronization',
  );
  for (const type of ['transfer', 'red_packet']) {
    for (const [state, visual, label] of [
      ['pending', 'pending', type === 'transfer' ? '待领取' : '未收款'],
      ['accepted', 'received', '已收款'],
      ['refund', 'refunded', '已退回'],
      ['returned', 'refunded', '已退回'],
      ['rejected', 'refunded', '已退回'],
      ['expired', 'expired', '已过期'],
    ]) {
      add(`visual-${type}-${state}`, type, { state }, 'user');
      await tick();
      const prefix = type === 'transfer' ? 'transfer' : 'red-packet';
      const card = [...document.querySelectorAll(`.wave-message-${prefix}`)].at(-1);
      assert(card.classList.contains(`${prefix}-${visual}`), `${type} ${state} class`);
      assert(card.textContent.includes(label), `${type} ${state} label`);
    }
  }
  add('switch', 'transfer');
  await tick();
  document.querySelector('.wave-message-transfer').click();
  await tick();
  const previousThread = phone.activeThread.id;
  const other = phone.addContact('Other', '');
  phone.startConversation(other);
  await tick();
  assert(!document.querySelector('[role=dialog]'));
  assert.throws(() => phone.respondToPayment(previousThread, 'switch', 'received'), /会话已切换/);
  app.unmount();
  console.log(
    'PASS: payment dialogs, keyboard access, receive/refuse, idempotent wallet credit, persistence, draft preservation, group shares, forwarded/own/invalid payments and chat isolation.',
  );
})().catch(error => {
  console.error(error);
  app.unmount();
  process.exitCode = 1;
});
