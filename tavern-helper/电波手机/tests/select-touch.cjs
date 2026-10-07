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
const vue = require('vue');
const Select = require('../components/shared/WaveSelect.vue').default;
let selected = '';
const app = vue.createApp(Select, { modelValue: '0', options: Array.from({ length: 20 }, (_, i) => ({ value: String(i), label: '角色 ' + i })), 'onUpdate:modelValue': value => { selected = value; } });
app.mount('#app');
(async () => {
  document.querySelector('.wave-select-trigger').click(); await vue.nextTick();
  const menu = document.querySelector('.wave-select-menu');
  let outerMoves = 0; document.body.addEventListener('touchmove', () => outerMoves++);
  const touch = (type, y) => { const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'touches', { value: [{ clientX: 30, clientY: y }] }); menu.dispatchEvent(event); assert.equal(event.defaultPrevented, false, 'native scrolling is never prevented'); };
  touch('touchstart', 100); touch('touchmove', 30); touch('touchend', 30);
  assert.equal(outerMoves, 0);
  menu.querySelectorAll('button')[1].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(selected, '', 'swipe does not select a character');
  touch('touchstart', 30); touch('touchend', 30);
  menu.querySelectorAll('button')[2].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(selected, '2', 'fresh tap selects normally');
  await vue.nextTick(); assert.equal(document.querySelector('.wave-select-menu'), null);
  app.unmount(); console.log('PASS: passive native gesture, outer isolation, swipe click suppression and normal tap');
})().catch(error => { console.error(error); process.exitCode = 1; });
