const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
const base = path.resolve(__dirname, '..');
const { stripExcludedTags } = require(base + '/services/generation/context-controls.ts');
assert.equal(stripExcludedTags('正文<!--秘密\n第二行-->结尾', []), '正文结尾');
assert.equal(stripExcludedTags('正文\\<!--隐藏-->结尾', []), '正文结尾');
assert.equal(stripExcludedTags('正文<!--未闭合', []), '正文');
assert.equal(stripExcludedTags('正常 <wave_time>时间</wave_time>', []), '正常 <wave_time>时间</wave_time>');
const { ScriptSettingsSchema } = require(base + '/schemas.ts');
const { buildCustomApi, effectiveTimeout, omitSampling } = require(base + '/services/core/api-config.ts');
const settings = ScriptSettingsSchema.parse({
  api: { enabled: true, apiurl: 'https://example.com/v1', model: 'gemini-4-argon', timeoutMs: 60000, stream: true },
});
assert(omitSampling('4argon'));
assert(omitSampling('gemini-4-argon'));
assert(!omitSampling('ordinary-model'));
const api = buildCustomApi(settings);
for (const key of ['temperature', 'top_p', 'top_k', 'presence_penalty', 'frequency_penalty'])
  assert.equal(api[key], 'unset');
assert.equal(effectiveTimeout(settings.api), 300000);
settings.api.autoTimeout = false;
assert.equal(effectiveTimeout(settings.api), 60000);
assert.equal(ScriptSettingsSchema.parse(JSON.parse(JSON.stringify(settings))).api.stream, true);
console.log('PASS: comment filtering, argon sampling omission, effective timeout and stream persistence');
