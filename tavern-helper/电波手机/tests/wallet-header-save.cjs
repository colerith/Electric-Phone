const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' });
for (const key of [
  'window',
  'document',
  'Document',
  'ShadowRoot',
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
const base = path.resolve(__dirname, '..');

const { usePhoneStore } = require(base + '/stores/phone.ts');
const accounts = require(base + '/services/wallet/wallet-accounts.ts');
const { WalletTransactionSchema } = require(base + '/services/wallet/wallet.ts');
const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
const { buildModulePrompt } = require(base + '/prompts/index.ts');
const Workspace = require(base + '/components/wallet/WaveWalletWorkspace.vue').default;
const { provideSettingsForms } = require(base + '/services/core/settings-forms.ts');
let phone, registry;
const app = vue.createApp({setup() {
  phone=usePhoneStore(); phone.settings.basic.cacheEnabled=false;
  registry=provideSettingsForms();
  return ()=>vue.h(Workspace,{mode:'settings'});
}});
app.use(createPinia()).mount('#app');
(async()=>{
  await phone.synchronize();await vue.nextTick();await vue.nextTick();
  const form=document.querySelector('.wallet-account-form');assert(form);
  assert.equal(form.querySelector('button[type=submit]'),null);
  const name=form.querySelector('input');name.value='新钱包名称';name.dispatchEvent(new Event('input',{bubbles:true}));
  const balance=form.querySelector('[aria-label="账户当前余额"]');balance.value='123.45';balance.dispatchEvent(new Event('input',{bubbles:true}));
  await vue.nextTick();assert.equal(registry.dirty.value,true);
  assert.equal(registry.save(),true);await vue.nextTick();
  const saved=phone.walletAccounts.find(a=>a.name==='新钱包名称');assert(saved);
  assert.equal(accounts.accountWallet(phone.state.walletBook,saved).balance,123.45);
  assert.equal(registry.dirty.value,false);
  name.value='';name.dispatchEvent(new Event('input',{bubbles:true}));await vue.nextTick();
  assert.equal(registry.save(),false,'无效输入不能被右上角保存忽略');
  assert.equal(registry.dirty.value,true);
  registry.discard();await vue.nextTick();assert.equal(name.value,'新钱包名称');
  app.unmount();console.log('PASS: wallet header registry saves name and balance, rejects invalid draft, tracks dirty and restores discarded changes');process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
