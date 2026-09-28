const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent'])
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
const vars = { global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => 'backup-ui', characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const Backup = require(base + '/components/settings/WaveBackupSettings.vue').default;
const { createPhoneBackup, inspectPhoneBackup } = require(base + '/services/core/backup.ts');
const app = vue.createApp(Backup).use(createPinia());
app.mount('#app');
const tick = () => vue.nextTick();
const click = text => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(text));
  assert(button, text);
  button.click();
};
let exported;
URL.createObjectURL = blob => {
  exported = blob;
  return 'blob:test';
};
URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = () => {};
(async () => {
  const checks = [...document.querySelectorAll('input[type=checkbox]')];
  assert.equal(checks.length, 12);
  assert.deepEqual(
    checks.filter(c => c.checked).map(c => c.value),
    ['messages'],
  );
  click('全选');
  await tick();
  assert(checks.every(c => c.checked));
  click('仅消息设置与角色');
  await tick();
  click('导出备份');
  await tick();
  assert(exported);
  const file = new File([await exported.arrayBuffer()], 'messages.zip');
  assert.deepEqual(await inspectPhoneBackup(file), ['messages']);
  if (process.env.WAVE_QA_HTML) fs.writeFileSync(process.env.WAVE_QA_HTML, document.querySelector('#app').innerHTML);
  const selected = createPhoneBackup(['messages', 'history']);
  const input = document.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [new File([await selected.blob.arrayBuffer()], 'two-modules.zip')] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 20));
  await tick();
  const incoming = [...document.querySelectorAll('.backup-confirm input[type=checkbox]')];
  assert.deepEqual(
    incoming.map(c => c.value),
    ['messages', 'history'],
  );
  for (const checkbox of incoming) {
    checkbox.click();
    await tick();
  }
  assert([...document.querySelectorAll('button')].find(b => b.textContent.includes('确认导入')).disabled);
  click('取消');
  await tick();
  assert(!document.querySelector('.backup-confirm'));
  console.log('PASS: backup module selection, isolated ZIP export, file inspection and empty-selection guard.');
  app.unmount();
})().catch(error => {
  console.error(error);
  app.unmount();
  process.exitCode = 1;
});
