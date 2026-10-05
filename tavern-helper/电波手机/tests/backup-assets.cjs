const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );
const { packBackupAssets, unpackBackupAssets } = require('../services/core/backup-assets.ts');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const image = 'data:image/png;base64,' + btoa('test image bytes');
const original = {
  format: 'wave-phone-backup',
  formatVersion: 2,
  modules: { zone: { cover: image, other: [image, '中文与换行\n保持原样', 'https://example.com/a%20b'] } },
};
function roundTrip(data) {
  const packed = packBackupAssets(data);
  const json = JSON.stringify(packed.data, null, 2) + '\n';
  const files = unzipSync(zipSync({ ...packed.files, 'backup.json': strToU8(json) }));
  const restored = unpackBackupAssets(JSON.parse(strFromU8(files['backup.json'])), files, 50 * 1024 * 1024);
  assert.deepEqual(restored, data);
  return { packed, json, files };
}
const { packed, json, files } = roundTrip(original);
assert.equal(Object.keys(packed.files).length, 1);
assert.equal(packed.data.assets.length, 2);
assert(!json.includes(btoa('test image bytes')));
assert(json.includes('\n  "format"'));
assert.equal(original.modules.zone.cover, image);
assert.throws(() => unpackBackupAssets(JSON.parse(json), {}, 1024), /缺少资源/);
assert.throws(() => unpackBackupAssets(JSON.parse(json), files, 1), /资源过大/);
const bad = JSON.parse(json);
bad.assets[0].path = ['__proto__', 'polluted'];
assert.throws(() => unpackBackupAssets(bad, files, 1024), /路径无效/);
assert.equal({}.polluted, undefined);
assert.deepEqual(unpackBackupAssets(original, {}, 1024), original);
roundTrip({ ...original, formatVersion: 1 });
if (process.argv[2]) {
  const sample = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const result = roundTrip(sample);
  console.log(
    `Sample verified without data loss: ${result.packed.data.assets.length} references, ${Object.keys(result.packed.files).length} unique asset(s). JSON: ${Buffer.byteLength(JSON.stringify(sample))} → ${Buffer.byteLength(result.json)} bytes.`,
  );
}
console.log('PASS: readable archive, deduplication, exact restoration, legacy formats and invalid resources.');
