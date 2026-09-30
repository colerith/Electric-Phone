const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict'),
  vm = require('node:vm');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global.z = require('zod').z;
global._ = require('lodash');
const { matchesWorldbookKey, collectManagedWorldbooks } = require('../services/generation/context-controls.ts');
const { fetchApiModels, normalizeApiBase } = require('../services/core/api-config.ts');
const { bindPhoneViewport } = require('../services/core/viewport.ts');
(async () => {
  const cross = vm.runInNewContext('/hello/gi');
  cross.lastIndex = 3;
  assert(!(cross instanceof RegExp));
  assert(matchesWorldbookKey(cross, 'HELLO'));
  assert(matchesWorldbookKey(cross, 'HELLO'));
  assert.equal(cross.lastIndex, 3);
  for (const key of [null, undefined, 42, {}, [], false]) assert.equal(matchesWorldbookKey(key, 'hello'), false);
  assert(matchesWorldbookKey('HELLO', 'hello'));
  assert(!matchesWorldbookKey('', 'hello'));
  global.getCharWorldbookNames = () => ({ primary: 'book', additional: [] });
  global.getWorldbook = async () => [
    {
      uid: 1,
      name: 'cross regex',
      enabled: true,
      content: '匹配内容',
      strategy: { type: 'selective', keys: [cross], keys_secondary: { keys: [null], logic: 'not_any' } },
    },
  ];
  const settings = { worldbooks: { books: {}, entries: {} }, basic: { excludedTags: [] } };
  assert((await collectManagedWorldbooks(settings, 'hello')).includes('匹配内容'));
  assert.equal(normalizeApiBase('https://example.com/'), 'https://example.com/v1');
  assert.equal(normalizeApiBase('https://example.com/proxy/v1/chat/completions'), 'https://example.com/proxy/v1');
  assert.equal(normalizeApiBase('https://example.com/v1/models'), 'https://example.com/v1');
  const api = { provider: 'openai', apiurl: 'https://example.com', key: 'test', timeoutMs: 1000 };
  global.fetch = async url => {
    assert.equal(url, 'https://example.com/v1/models');
    return new Response('<!doctype html><html>login</html>', { headers: { 'content-type': 'text/html' } });
  };
  await assert.rejects(fetchApiModels(api), /网页（HTML）/);
  global.fetch = async () => new Response(JSON.stringify({ data: [null, { id: 'model-a' }] }));
  assert.deepEqual(await fetchApiModels(api), ['model-a']);
  global.fetch = async () => new Response('not json');
  await assert.rejects(fetchApiModels(api), /不是有效 JSON/);
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="root"><input></div>', { pretendToBeVisual: true });
  const win = dom.window;
  win.matchMedia = () => ({ matches: true });
  Object.defineProperty(win, 'innerWidth', { value: 390 });
  Object.defineProperty(win, 'innerHeight', { value: 800 });
  const viewport = new win.EventTarget();
  Object.assign(viewport, { width: 390, height: 800, offsetLeft: 0, offsetTop: 0 });
  Object.defineProperty(win, 'visualViewport', { value: viewport });
  const root = win.document.querySelector('#root'),
    input = root.querySelector('input');
  let scrolls = 0;
  input.getBoundingClientRect = () => ({ top: 600, bottom: 640 });
  input.scrollIntoView = () => scrolls++;
  const release = bindPhoneViewport(root);
  input.focus();
  viewport.height = 360;
  viewport.dispatchEvent(new win.Event('resize'));
  await new Promise(r => setTimeout(r, 40));
  assert.equal(root.style.getPropertyValue('--wave-panel-height'), '360px');
  assert(scrolls > 0);
  assert.equal(win.document.activeElement, input);
  input.value = '中文输入';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(input.value, '中文输入');
  release();
  dom.window.close();
  console.log(
    'PASS: cross-realm worldbook regex, invalid keys, model URL/HTML/JSON handling, keyboard viewport and input focus',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
