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
  getCharData: () => ({ name: 'Alice', description: '角色卡描述：喜欢旅行。' }),
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
const Switch = require(base + '/components/shared/WaveCharacterSwitch.vue').default;
const Memo = require(base + '/components/apps/WaveMemoPanel.vue').default;
const Settings = require(base + '/components/settings/WaveModuleSettings.vue').default;
const { ModuleSettingsSchema } = require(base + '/services/generation/module-settings.ts');
let phone;
const deleted = [];
const raw = JSON.stringify({
  notes: [
    { id: 'old', title: '旧便签', content: '旧内容' },
    { id: 'new', title: '新便签', content: '新内容' },
  ],
  doodles: [
    { id: 'd1', title: '旧涂鸦', content: 'one' },
    { id: 'd2', title: '新涂鸦', content: 'two' },
  ],
});
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    return () =>
      vue.h('section', [
        vue.h(Switch),
        vue.h(Settings, { app: 'memo' }),
        vue.h(Memo, {
          raw,
          sortOrder: phone.settings.moduleSettings.memo.sortOrder,
          onDelete: (...args) => deleted.push(args),
        }),
      ]);
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
(async () => {
  await phone.synchronize();
  const alice = phone.activeIdentity.charKey;
  const bob = phone.addContact('Bob', '朋友');
  const npc = phone.addContact('路人', '路人');
  phone.selectIdentity(npc);
  phone.setContactDetails({ actorType: 'npc', relationshipToUser: '路人', npcProfile: '' });
  phone.selectIdentity(bob);
  phone.setContactDetails({ actorType: 'main', relationshipToUser: '朋友', npcProfile: '' });
  const group = phone.createGroup('群聊', [alice, bob]);
  assert.deepEqual(phone.panelCharacters.map(x => x.charKey).sort(), [alice, bob].sort());
  phone.selectPanelCharacter(npc);
  assert.equal(phone.activeIdentity.charKey, bob);
  phone.selectPanelCharacter(group);
  assert.equal(phone.activeIdentity.charKey, bob);
  for (const page of ['status', 'memo', 'zone', 'calendar', 'browse', 'music']) {
    phone.state.snapshots[alice][page] = 'Alice ' + page;
    phone.state.snapshots[bob][page] = 'Bob ' + page;
    phone.currentPage = page;
    phone.selectPanelCharacter(alice);
    assert.equal(phone.activeSnapshot[page], 'Alice ' + page);
    phone.selectPanelCharacter(bob);
    assert.equal(phone.activeSnapshot[page], 'Bob ' + page);
    assert.equal(phone.currentPage, page);
  }
  await tick();
  document.querySelector('.wave-character-switch .wave-select-trigger').click();
  await tick();
  const options = [...document.querySelectorAll('.wave-character-switch [role=option]')];
  assert.equal(options.length, 2);
  if (process.env.WAVE_PANEL_QA) {
    const sass = require('sass');
    const styles = [...fs.readFileSync(base + '/index.ts', 'utf8').matchAll(/import '(.+?\.scss)'/g)]
      .map(match => sass.compile(path.resolve(base, match[1]), { logger: sass.Logger.silent }).css)
      .join('\n');
    const componentStyle = parse(fs.readFileSync(base + '/components/shared/WaveCharacterSwitch.vue', 'utf8'))
      .descriptor.styles[0].content;
    const css = styles + sass.compileString(componentStyle).css;
    const menu = document.querySelector('.wave-character-switch').outerHTML;
    fs.writeFileSync(
      process.env.WAVE_PANEL_QA,
      `<meta charset="utf-8"><style>${css}body{margin:0}#wave-phone-script-root .wave-device{width:328px!important;height:650px!important;margin:12px auto!important;position:relative!important;inset:auto!important;transform:none!important}#wave-phone-script-root .wave-overlay{display:block!important}.qa-icon{font-style:normal}</style><div id="wave-phone-script-root"><div class="wave-phone-host"><div class="wave-overlay"><section class="wave-device is-subpage page-memo"><div class="wave-statusbar">22:30</div><header class="wave-appbar"><button>‹</button><div><strong>备忘</strong></div><div class="appbar-tools"><button>✧</button><button>☰</button>${menu}</div></header><main class="wave-screen"><section class="wave-app-content app-memo">${document.querySelector('.wave-memo-panel').outerHTML}</section></main></section></div></div></div>`,
    );
  }
  assert(!options.some(x => x.textContent.includes('路人') || x.textContent.includes('群聊')));
  options.find(x => x.textContent.includes('Alice')).click();
  await tick();
  assert.equal(phone.activeIdentity.charKey, alice);
  assert(!document.querySelector('.wave-character-switch [role=listbox]'));
  assert.equal(ModuleSettingsSchema.parse({}).memo.sortOrder, 'asc');
  assert.deepEqual(
    [...document.querySelectorAll('.memo-paper-title')].map(x => x.textContent),
    ['旧便签', '新便签'],
  );
  document.querySelector('[aria-label="备忘查看顺序"]').click();
  await tick();
  [...document.querySelectorAll('[role=option]')].find(x => x.textContent.includes('倒序')).click();
  await tick();
  assert.deepEqual(
    [...document.querySelectorAll('.memo-paper-title')].map(x => x.textContent),
    ['新便签', '旧便签'],
  );
  assert.deepEqual(
    [...document.querySelectorAll('.memo-ticket-heading strong')].map(x => x.textContent),
    ['新涂鸦', '旧涂鸦'],
  );
  assert.equal(JSON.parse(raw).notes[0].id, 'old');
  assert.equal(phone.settings.moduleSettings.memo.sortOrder, 'desc');
  assert(JSON.stringify(vars).includes('"sortOrder":"desc"'));
  document.querySelector('.memo-paper .wave-content-delete').click();
  assert.deepEqual(deleted[0], ['note', 'new']);
  phone.settings.moduleSettings.memo.sortOrder = 'asc';
  await tick();
  assert.equal(document.querySelector('.memo-paper-title').textContent, '旧便签');
  app.unmount();
  console.log(
    'PASS: six character panels, primary-only avatar menu, memo ordering, persistence and stable deletion IDs.',
  );
})().catch(error => {
  console.error(error);
  app.unmount();
  process.exitCode = 1;
});
