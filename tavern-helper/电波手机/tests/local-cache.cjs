const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
const { indexedDB, IDBObjectStore } = require('fake-indexeddb');
global.indexedDB = indexedDB;
const originalGetAll = IDBObjectStore.prototype.getAll;
IDBObjectStore.prototype.getAll = function (...args) {
  assert.equal(this.name, 'metadata', 'never materialize all cached chat bodies');
  return originalGetAll.apply(this, args);
};
const { cachedParse, cacheStats, clearParseCache } = require('../services/core/local-cache.ts');
(async () => {
  const value = { large: 'x'.repeat(256 * 1024) };
  for (let i = 0; i < 20; i++) await cachedParse('card' + i, 'chat', 'v1', 1, () => value);
  assert.equal((await cacheStats()).count, 20);
  assert.deepEqual(
    await cachedParse('card7', 'chat', 'v1', 1, () => {
      throw Error('cache miss');
    }),
    value,
  );
  await clearParseCache('card7');
  assert.equal((await cacheStats()).count, 19);
  await cachedParse('card0', 'next', 'v2', 0.3, () => value);
  assert.equal((await cacheStats('card0')).count, 1, 'per-card limit still evicts old records');
  await clearParseCache();
  assert.equal((await cacheStats()).bytes, 0);
  console.log('PASS: 20 chat caches, keyed reads only, lightweight stats, eviction and clear.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
