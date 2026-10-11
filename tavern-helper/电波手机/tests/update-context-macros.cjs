const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const assert = require('node:assert/strict'),
  ts = require('typescript');
const compile = text =>
  ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    .outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const base = path.resolve(__dirname, '..');
const { fitContext } = require(base + '/services/core/api-config.ts');
const { diagnostics } = require(base + '/services/core/diagnostics.ts');
const { expandTavernMacros } = require(base + '/services/core/tavern-macros.ts');
const { actorContext } = require(base + '/services/chat/chat-history.ts');
for (const actorType of ['main', 'npc'])
  assert.equal(
    actorContext({ actorType, npcProfile: 'imported persona', about: 'container description' }).profile,
    'imported persona',
  );
const prompts = [{ role: 'system', content: 'a'.repeat(400) }];
assert.throws(() => fitContext(prompts, 'hello', { contextLength: 100, maxTokens: 50 }), /输入预算 50[\s\S]*第 1 段/);
assert.equal(prompts[0].content.length, 400);
assert.equal(diagnostics.logs[0].event, '上下文用量');
assert.equal(fitContext(prompts, '', { contextLength: 200, maxTokens: 50 }).length, 1);
let calls = 0;
global.window = {
  SillyTavern: {
    getContext: () => ({
      substituteParams: text => {
        calls++;
        assert.equal(text, '{{char}} {{user}} {{time}} {{roll:1d6}} {{random::a::b}}');
        return 'Alice User 12:00 4 a';
      },
    }),
  },
};
assert.equal(expandTavernMacros('<char> <user> {{time}} {{roll:1d6}} {{random::a::b}}'), 'Alice User 12:00 4 a');
assert.equal(calls, 1);
assert.equal(expandTavernMacros('plain'), 'plain');
const source = fs
  .readFileSync(base + '/components/settings/WaveExtensionUpdate.vue', 'utf8')
  .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
let reloads = 0,
  fail = false;
const requests = [];
const sandbox = {
  exports: {},
  AbortSignal,
  window: {
    location: { reload: () => reloads++ },
    SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }) }) },
  },
  require: id =>
    id === 'vue' ? { ref: value => ({ value }), onMounted: () => {} } : { WAVE_PHONE_RELEASE_VERSION: 'test' },
  fetch: async (url, options) => {
    requests.push([url, options]);
    if (url.endsWith('/discover'))
      return { ok: true, json: async () => [{ name: 'third-party/renamed-phone', type: 'global' }] };
    if (url.endsWith('/manifest.json'))
      return { ok: true, json: async () => ({ homePage: 'https://github.com/colerith/Electric-Phone' }) };
    if (url.endsWith('/update') && fail) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({ remoteUrl: 'repo', isUpToDate: false }) };
  },
};
vm.runInNewContext(compile(source + '\nexport { check, update, status, available };'), sandbox);
(async () => {
  await sandbox.exports.check();
  assert.equal(sandbox.exports.available.value, true);
  const request = requests.find(([url]) => url.endsWith('/version'))[1];
  assert.deepEqual(JSON.parse(request.body), { extensionName: 'renamed-phone', global: true });
  assert.equal(request.headers['X-CSRF-Token'], 'test');
  fail = true;
  await sandbox.exports.update();
  assert.equal(reloads, 0);
  fail = false;
  await sandbox.exports.update();
  assert.equal(reloads, 1);
  console.log(
    'PASS: context accounting, native macro delegation, renamed/global extension discovery, CSRF, failed update preservation, successful update reload',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
