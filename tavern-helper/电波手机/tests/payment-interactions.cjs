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
  phone.setDraft('保留草稿');
  click('领取红包');
  await tick();
  assert(document.querySelector('.payment-status').textContent.includes('已收款'));
  assert(!document.querySelector('.payment-actions'));
  assert.equal(phone.activeThread.draft, '保留草稿');
  assert.equal(Object.values(phone.state.walletBook.accounts.user.manual).length, 1);
  assert.equal(Object.values(phone.state.walletBook.accounts.user.manual)[0].amount, 88);
  assert.throws(() => phone.respondToPayment(phone.activeThread.id, 'packet', 'received'), /已处理/);
  assert.equal(phone.activeThread.messages.filter(m => m.payload.interaction === 'payment_receipt').length, 1);
  document.querySelector('[aria-label="关闭收款详情"]').click();
  await tick();
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
  assert.equal(group.payload.userReceivedAmount, 40);
  assert.equal(group.payload.claimedCount, 2);
  assert.equal(group.payload.claimedAmount, 60);
  assert.throws(() => phone.respondToPayment(phone.activeThread.id, 'group', 'received'), /已处理/);
  add('group-refuse', 'red_packet', { packetType: 'group', count: 3, state: 'group_available' });
  phone.respondToPayment(phone.activeThread.id, 'group-refuse', 'refunded');
  assert.equal(phone.activeThread.messages.find(m => m.id === 'group-refuse').payload.state, 'group_available');
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
