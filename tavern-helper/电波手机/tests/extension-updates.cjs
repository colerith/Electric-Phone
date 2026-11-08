const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    f,
  );
const dom = new JSDOM(
  '<div><header class="inline-drawer-header"><strong>电波手机</strong></header><main></main></div><div id="vue-test"></div>',
);
global.document = dom.window.document;
global.Option = dom.window.Option;
let reloads = 0,
  version = 'main',
  upToDate = false,
  failUpdate = false,
  failSwitch = false;
global.window = {
  SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }) }) },
  location: { reload: () => reloads++ },
};
const calls = [];
global.fetch = async (url, options = {}) => {
  if (url.startsWith('https://raw.githubusercontent.com/')) return Response.json({ version: '1.14.2' });
  if (url === '/api/extensions/discover') return Response.json([{ name: 'third-party/renamed-phone', type: 'global' }]);
  if (url.endsWith('/manifest.json')) return Response.json({ homePage: 'https://github.com/colerith/Electric-Phone' });
  const action = url.split('/').at(-1),
    body = JSON.parse(options.body);
  calls.push({ action, body });
  assert.equal(body.extensionName, 'renamed-phone');
  assert.equal(body.global, true);
  assert.equal(options.headers['X-CSRF-Token'], 'test');
  if (action === 'version')
    return Response.json({
      currentBranchName: version,
      remoteUrl: 'https://github.com/colerith/Electric-Phone',
      isUpToDate: upToDate,
    });
  if (action === 'branches')
    return Response.json([
      { name: 'main' },
      { name: 'origin/main' },
      { name: 'origin/beta' },
      { name: 'origin/feature/mobile' },
      { name: 'origin/HEAD' },
    ]);
  if (action === 'switch') {
    if (failSwitch) return new Response('', { status: 403 });
    version = body.branch.replace('origin/', '');
    return new Response(null, { status: 204 });
  }
  if (action === 'update') {
    if (failUpdate) return new Response('failed', { status: 500 });
    upToDate = true;
    return Response.json({});
  }
  throw Error(url);
};
let preparations = 0,
  failSave = false;
require.cache[require.resolve('../services/core/durable-storage.ts')] = {
  exports: {
    preparePhoneRelease: async () => {
      preparations++;
      if (failSave) throw Error('备份保存失败');
    },
    flushPhoneStorage: async () => {},
  },
};
const { installUpdateControls } = require('../extension/update-controls.ts');
installUpdateControls(document.querySelector('main'));
const get = s => document.querySelector(s),
  tick = async () => {
    for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r));
  };
(async () => {
  get('.wave-ext-check').click();
  get('.wave-ext-check').click();
  await tick();
  assert.equal(calls.filter(c => c.action === 'version').length, 1, 'duplicate checks suppressed');
  assert.equal(get('.wave-ext-update').hidden, false);
  assert.equal(get('.wave-ext-new').hidden, false);
  assert.match(get('.wave-ext-update-banner strong').textContent, /1\.14\.2/);
  assert.equal(get('[data-branch="main"]').disabled, true);
  await tick();
  failSave = true;
  const beforeFailedSave = calls.length;
  get('[data-branch=beta]').click();
  await tick();
  assert(!calls.slice(beforeFailedSave).some(c => c.action === 'switch'));
  assert.equal(reloads, 0);
  failSave = false;
  get('.wave-ext-update').click();
  await tick();
  assert.equal(reloads, 1);
  get('[data-branch="beta"]').click();
  await tick();
  assert.equal(version, 'beta');
  assert.equal(reloads, 2);
  assert.deepEqual(
    calls.slice(-4).map(c => c.action),
    ['branches', 'switch', 'update', 'version'],
  );
  assert.equal(calls.findLast(c => c.action === 'switch').body.branch, 'origin/beta');
  get('.wave-ext-list').click();
  await tick();
  assert.deepEqual(
    [...get('select').options].map(o => o.value),
    ['', 'main', 'beta', 'feature/mobile'],
  );
  get('select').value = 'feature/mobile';
  get('select').dispatchEvent(new dom.window.Event('change'));
  failUpdate = true;
  get('.wave-ext-switch').click();
  await tick();
  assert.equal(version, 'feature/mobile');
  assert.equal(reloads, 2);
  assert.equal(get('.wave-ext-reload').hidden, false);
  assert.match(get('.wave-ext-update-status').textContent, /已切换.*更新失败/);
  failSwitch = true;
  get('[data-branch="main"]').click();
  await tick();
  assert.equal(version, 'feature/mobile');
  assert.match(get('.wave-ext-update-status').textContent, /权限/);
  failSwitch = false;
  failUpdate = false;
  upToDate = true;
  get('.wave-ext-check').click();
  await tick();
  assert.equal(get('.wave-ext-update').hidden, true);
  console.log(
    'PASS update discovery, global scope, CSRF, busy guard, 204 switching, remote branch selection and partial-failure recovery',
  );
  // Mount the real in-phone Vue updater against the same service and mocked host API.
  global.Element = dom.window.Element;
  global.SVGElement = dom.window.SVGElement;
  global.HTMLElement = dom.window.HTMLElement;
  const vue = require('vue'),
    compiler = require('vue/compiler-sfc');
  const file = path.resolve(__dirname, '../components/settings/WaveExtensionUpdate.vue');
  const script = compiler.compileScript(compiler.parse(fs.readFileSync(file, 'utf8')).descriptor, {
    id: 'update-test',
    inlineTemplate: true,
  }).content;
  const m = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
      .outputText,
  )(
    id =>
      id === 'vue'
        ? vue
        : id === '../../schemas'
          ? { WAVE_PHONE_RELEASE_VERSION: '1.14.1', WAVE_PHONE_RELEASE_DATE: '2026.11.08' }
          : require('../services/core/extension-update.ts'),
    m,
    m.exports,
  );
  upToDate = false;
  const app = vue.createApp(m.exports.default);
  app.mount('#vue-test');
  await tick();
  await vue.nextTick();
  assert.match(get('#vue-test').textContent, /1\.14\.2/);
  const before = reloads;
  get('#vue-test button').click();
  await tick();
  assert.equal(reloads, before + 1, 'in-phone updater pulls and verifies before reloading');
  assert.deepEqual(
    calls.slice(-2).map(c => c.action),
    ['update', 'version'],
  );
  app.unmount();
  dom.window.close();
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
  dom.window.close();
});
