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

const Assistive = require(base + '/components/shared/WaveAssistiveTouch.vue').default;
let phone;
const app=vue.createApp({setup(){phone=usePhoneStore();phone.settings.basic.cacheEnabled=false;return ()=>vue.h('div',{class:'wave-device'},[vue.h(Assistive)]);}});
app.use(createPinia()).mount('#app');
const tick=async()=>{await vue.nextTick();await vue.nextTick();};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(text));
const click=async text=>{assert(button(text),text);button(text).click();await tick();};
const select=async (label,value)=>{const el=document.querySelector(`button[aria-label="${label}"]`);assert(el,label);el.click();await tick();const text={memo:'备忘',user:'我的钱包'}[value]||value;const option=[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim().includes(text));assert(option,text);option.click();await tick();};
(async()=>{
 await phone.synchronize();await tick();
 const first=phone.state.activeCharKey;
 const bob=phone.addContact('Bob','Main');phone.state.identities[bob].actorType='main';
 const ball=document.querySelector('[aria-label="辅助触控"]');assert(ball);
 const device=document.querySelector('.wave-device');
 device.getBoundingClientRect=()=>({left:0,top:0,width:400,height:800});
 Object.defineProperty(device,'offsetHeight',{value:800});
 const pointer=(type,x,y)=>{const e=new Event(type,{bubbles:true});Object.assign(e,{button:0,pointerId:1,clientX:x,clientY:y});ball.dispatchEvent(e);};
 pointer('pointerdown',380,400);pointer('pointermove',30,300);pointer('pointerup',30,300);await tick();
 assert.equal(phone.settings.appearance.assistivePosition.edge,'left');
 assert(phone.settings.appearance.assistivePosition.y>0 && phone.settings.appearance.assistivePosition.y<1);
 ball.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));await tick();assert(!document.querySelector('[role=dialog]'));
 ball.click();await tick();assert(document.querySelector('[role=dialog]'));
 await click('角色');await click('Bob');assert.equal(phone.state.activeCharKey,bob);
 document.querySelector('[aria-label="返回辅助触控首页"]').click();await tick();await click('翻译');
 const toggle=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('自动附带译文')).querySelector('[role=switch]');toggle.click();await tick();
 assert.equal(phone.state.chatPreferences[bob].autoTranslate,true);
 assert(!phone.state.chatPreferences[first]?.autoTranslate);
 await select('快捷翻译应用','memo');
 const sync=document.querySelector('[role=switch]');sync.click();await tick();
 assert.equal(phone.settings.moduleSettings.memo.syncChat,false);
 document.querySelector('[aria-label="返回辅助触控首页"]').click();await tick();await click('钱包');
 phone.saveWalletAccount('user',{name:'我的钱包',currency:'CNY',balance:100,bankName:'',cardLabel:'',cardLastFour:''});
 phone.addWalletTransaction(WalletTransactionSchema.parse({id:'test-row',date:'2026-01-01',type:'expense',amount:15,currency:'CNY',category:'餐饮',note:'午餐'}),'user');
 const before=JSON.stringify(phone.state.walletBook.accounts.user);
 await select('钱包设置范围','user');await select('快捷钱包币种','JPY');await click('统一币种（金额不变）');
 let wallet=accounts.accountWallet(phone.state.walletBook,phone.state.walletBook.accounts.user);
 assert.equal(wallet.currency,'JPY');assert.equal(wallet.balance,85);assert.equal(wallet.transactions[0].amount,15);assert.equal(wallet.transactions[0].currency,'JPY');
 assert(phone.state.walletBook.accounts.user.currencyMigrationBackup);
 await click('撤销本次币种统一');assert.equal(JSON.stringify(phone.state.walletBook.accounts.user),before);
 await click('统一币种（金额不变）');
 phone.addWalletTransaction(WalletTransactionSchema.parse({id:'later',date:'2026-01-01',type:'expense',amount:2,currency:'JPY',category:'餐饮',note:'新交易'}),'user');
 await click('撤销本次币种统一');assert(document.body.textContent.includes('账户已有新变更'));
 assert.equal(accounts.accountWallet(phone.state.walletBook,phone.state.walletBook.accounts.user).balance,83);
 document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();assert(!document.querySelector('[role=dialog]'));
 const descriptor=parse(fs.readFileSync(base+'/components/shared/WaveAssistiveTouch.vue','utf8')).descriptor;
 assert(require('sass').compileString(descriptor.styles[0].content).css.includes('pointer-events: none'));
 for(const style of descriptor.styles){const css=require('sass').compileString(style.content).css;const result=require('vue/compiler-sfc').compileStyle({source:css,filename:'Assistive.vue',id:'data-v-test',scoped:!!style.scoped});assert.equal(result.errors.length,0);assert(!/#wave-phone-script-root\s*\{/.test(result.code),'must never style the host root');}
 app.unmount();console.log('PASS assistive drag/snap, click suppression, actor selection, scoped translation, currency migration, undo and stale-undo protection');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
