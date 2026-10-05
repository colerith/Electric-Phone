const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="wave-phone-script-root"><div class="wave-device"><div id="app"></div></div></div>', {
  url: 'http://localhost',
});
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent'])
  global[key] = dom.window[key];
const compile = code =>
  ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const { parse, compileScript, compileStyle } = require('vue/compiler-sfc');
require.extensions['.vue'] = (m, f) => {
  const { descriptor } = parse(fs.readFileSync(f, 'utf8'));
  m._compile(compile(compileScript(descriptor, { id: f, inlineTemplate: true }).content), f);
  const id = 'data-v-' + require('node:crypto').createHash('sha1').update(f).digest('hex').slice(0, 8);
  m.exports.default.__scopeId = id;
  for (const block of descriptor.styles) {
    const result = compileStyle({
      source: block.content,
      filename: f,
      id,
      scoped: block.scoped,
      preprocessLang: block.lang,
    });
    assert.deepEqual(result.errors, []);
    const style = document.createElement('style');
    style.textContent = result.code;
    document.head.append(style);
  }
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
app.provide(
  require(base + '/services/core/ui-context.ts').phoneSurfaceKey,
  vue.ref(document.querySelector('.wave-device')),
);
app.mount('#app');
const tick = () => vue.nextTick();
const click = text => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
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
  assert.equal(document.querySelectorAll('.backup-modules input[type=checkbox]').length, 0);
  assert(!document.body.textContent.includes('仅消息设置与角色'));
  click('分批导出备份');
  await tick();
  const checks = [...document.querySelectorAll('.backup-dialog .backup-modules input[type=checkbox]')];
  assert.equal(checks.length, 12);
  const hostileStyle = document.createElement('style');
  hostileStyle.textContent =
    '#wave-phone-script-root .wave-device input[type=checkbox] { width: 100%; min-height: 42px; padding: 12px; border-radius: 50%; }';
  document.head.append(hostileStyle);
  assert.equal(window.getComputedStyle(checks[0]).width, '1px');
  assert.equal(window.getComputedStyle(checks[0]).opacity, '0');
  assert.equal(window.getComputedStyle(checks[0].nextElementSibling).width, '20px');
  assert.equal(window.getComputedStyle(checks[0].nextElementSibling).height, '20px');
  assert(!document.querySelector('.backup-dialog').classList.contains('settings-card'));
  assert(document.querySelector('.wave-backup-dialog-body'));
  assert.deepEqual(
    checks.filter(c => c.checked).map(c => c.value),
    ['messages'],
  );
  document.querySelector('.backup-select-all input').click();
  await tick();
  assert(checks.every(c => c.checked));
  for (const check of checks) {
    if (check.value !== 'messages') {
      check.click();
      await tick();
    }
  }
  await tick();
  click('导出备份');
  await tick();
  assert(exported);
  const file = new File([await exported.arrayBuffer()], 'messages.zip');
  assert.deepEqual(await inspectPhoneBackup(file), ['messages']);
  click('全量导出备份');
  await tick();
  assert.deepEqual(
    await inspectPhoneBackup(new File([await exported.arrayBuffer()], 'all.zip')).then(items => items.length),
    12,
  );
  if (process.env.WAVE_QA_HTML) fs.writeFileSync(process.env.WAVE_QA_HTML, document.querySelector('#app').innerHTML);
  const selected = createPhoneBackup(['messages', 'history']);
  const input = document.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [new File([await selected.blob.arrayBuffer()], 'two-modules.zip')] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 20));
  await tick();
  const incoming = [...document.querySelectorAll('.backup-confirm .backup-modules input[type=checkbox]')];
  assert.deepEqual(
    incoming.map(c => c.value),
    ['messages', 'history'],
  );
  const selectAll = document.querySelector('.backup-confirm .backup-select-all input');
  assert(selectAll.checked);
  selectAll.click();
  await tick();
  assert(incoming.every(c => !c.checked));
  selectAll.click();
  await tick();
  assert(incoming.every(c => c.checked));
  for (const checkbox of incoming) {
    checkbox.click();
    await tick();
  }
  assert([...document.querySelectorAll('button')].find(b => b.textContent.includes('确认导入')).disabled);
  assert(!selectAll.checked);
  if (process.env.WAVE_QA_IMPORT_HTML)
    fs.writeFileSync(process.env.WAVE_QA_IMPORT_HTML, document.querySelector('#app').innerHTML);
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
