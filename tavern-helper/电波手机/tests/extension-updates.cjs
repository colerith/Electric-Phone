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
const dom = new JSDOM('<main></main>');
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
  if (action === 'update') return failUpdate ? new Response('failed', { status: 500 }) : Response.json({});
  throw Error(url);
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
  assert.equal(get('[data-branch="main"]').disabled, true);
  get('.wave-ext-update').click();
  await tick();
  assert.equal(reloads, 1);
  get('[data-branch="beta"]').click();
  await tick();
  assert.equal(version, 'beta');
  assert.equal(reloads, 2);
  assert.deepEqual(
    calls.slice(-3).map(c => c.action),
    ['branches', 'switch', 'update'],
  );
  assert.equal(calls.at(-2).body.branch, 'origin/beta');
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
  dom.window.close();
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
  dom.window.close();
});
