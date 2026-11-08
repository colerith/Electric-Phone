const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    f,
  );
const base = path.resolve(
  fs.existsSync('src/util/酒馆助手脚本/电波手机') ? 'src/util/酒馆助手脚本/电波手机' : 'tavern-helper/电波手机',
);
global.location = { href: 'https://phone.test/', origin: 'https://phone.test' };
global.indexedDB = require(
  require.resolve('fake-indexeddb', { paths: [process.cwd(), path.resolve('.wave-publish/Electric-Phone')] }),
).indexedDB;
let calls = 0,
  inflight = 0,
  peak = 0;
global.fetch = async () => {
  calls++;
  inflight++;
  peak = Math.max(peak, inflight);
  await new Promise(r => setTimeout(r, 5));
  inflight--;
  return new Response(new Blob(['image'], { type: 'image/png' }));
};
const file = base + '/services/core/image-cache.ts';
let cache = require(file);
(async () => {
  const leases = await Promise.all(Array.from({ length: 8 }, () => cache.acquireImage('/icon.png')));
  assert.equal(calls, 1);
  assert.equal(new Set(leases.map(i => i.src)).size, 1);
  leases.forEach(i => i.release());
  const again = await cache.acquireImage('/icon.png');
  assert.equal(calls, 1);
  again.release();
  await cache.warmImages(Array.from({ length: 10 }, (_, i) => `/other-${i}.png`));
  assert(peak <= 4);
  const external = await cache.acquireImage('https://external.test/avatar.png');
  assert.equal(external.src, 'https://external.test/avatar.png');
  const immutable = '/assets/resources/' + 'a'.repeat(64) + '.png';
  const stored = await cache.acquireImage(immutable);
  stored.release();
  await new Promise(r => setTimeout(r, 30));
  const before = calls;
  delete require.cache[require.resolve(file)];
  cache = require(file);
  const disk = await cache.acquireImage(immutable);
  assert.equal(calls, before);
  disk.release();
  cache.invalidateImage(immutable);
  const retried = await cache.acquireImage(immutable);
  assert.equal(calls, before + 1);
  retried.release();
  const gate = require(base + '/services/core/phone-activity.ts');
  const signal = gate.phoneActivitySignal();
  gate.setPhoneActive(false);
  assert(signal.aborted);
  assert.throws(() => gate.phoneActivitySignal());
  gate.setPhoneActive(true);
  assert(!gate.phoneActivitySignal().aborted);
  console.log('PASS image dedup, reuse, concurrency, disk cache, retry and activation abort gate');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
