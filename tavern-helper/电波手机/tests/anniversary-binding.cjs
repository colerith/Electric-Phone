const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div><div id="bbs"></div>', { url: 'http://localhost' });
for (const key of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Event',
  'MouseEvent',
  'MutationObserver',
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
let chat = 'clock-one',
  vars = { global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', characterId: '1', groupId: '', getCurrentChatId: () => chat },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getVariables: ({ type }) => vars[type],
  replaceVariables: (value, { type }) => (vars[type] = value),
});

global.getChatMessages = () => [];
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const vue = require('vue'),
  { createPinia, setActivePinia } = require('pinia');
const pinia = createPinia();
setActivePinia(pinia);
const phone = require(base + '/stores/phone.ts').usePhoneStore();
const Appearance = require(base + '/components/settings/WaveHomeAppearance.vue').default;
const Home = require(base + '/components/shell/WaveHome.vue').default;
const app = vue
  .createApp({
    setup: () => () =>
      vue.h('div', [
        vue.h(Appearance, { apps: [] }),
        vue.h(Home, {
          clock: '12:00',
          cardKey: phone.context?.cardKey || '',
          sourceAvatar: '',
          userName: 'User',
          userAvatar: '',
          agenda: '',
          unread: 0,
          updatedApps: [],
          apps: [],
        }),
      ]),
  })
  .use(pinia);
const tick = () => vue.nextTick();
(async () => {
  phone.settings.basic.cacheEnabled = false;
  await phone.synchronize();
  const alice = phone.activeIdentity.charKey,
    bob = phone.addContact('Bob', '主要角色');
  phone.state.identities[alice].avatar = 'alice-avatar.png';
  phone.state.identities[bob].avatar = 'bob-avatar.png';
  phone.addSpaceContact('guest', '路人NPC', '', '路人');
  phone.startConversation(bob);
  phone.settings.appearance.anniversaries[phone.context.cardKey] = '2020-01-01';
  app.mount('#app');
  await tick();
  assert.equal(document.querySelector('#wave-anniversary-date').value, '2020-01-01');
  document.querySelector('[aria-label="纪念日绑定角色"]').click();
  await tick();
  const options = [...document.querySelectorAll('[role=option]')];
  assert.deepEqual(
    options.map(option => option.textContent.trim()),
    ['Alice', 'Bob'],
  );
  options.find(option => option.textContent.includes('Alice')).click();
  await tick();
  const input = document.querySelector('#wave-anniversary-date');
  assert.equal(input.value, '');
  input.value = '2021-02-03';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  assert(document.querySelector('.anniversary-copy').textContent.includes('与Alice'));
  assert.equal(document.querySelectorAll('.anniversary-avatar img')[0].getAttribute('src'), 'alice-avatar.png');
  phone.startConversation(bob);
  await tick();
  assert(
    document.querySelector('.anniversary-copy').textContent.includes('与Alice'),
    'binding does not follow active conversation',
  );
  phone.saveSettings();
  const { SCRIPT_VARIABLE_KEY } = require(base + '/schemas.ts');
  const appearance = vars.global[SCRIPT_VARIABLE_KEY].data.appearance;
  assert.equal(appearance.anniversaryBindings[phone.context.cardKey], alice);
  assert.equal(appearance.anniversaryDates[`${phone.context.cardKey}::${bob}`], '2020-01-01');
  assert.equal(appearance.anniversaryDates[`${phone.context.cardKey}::${alice}`], '2021-02-03');
  if (process.env.WAVE_QA_HTML)
    fs.writeFileSync(process.env.WAVE_QA_HTML, document.querySelector('.home-appearance-editor').outerHTML);
  console.log(
    'PASS: anniversary only lists main characters, migrates legacy dates and keeps bound portrait/date across conversation changes.',
  );
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.unmount());
