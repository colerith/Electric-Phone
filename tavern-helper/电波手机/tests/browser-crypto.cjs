const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict'),
  nodeCrypto = require('node:crypto');
require.extensions['.ts'] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
    file,
  );
const { sha256Hex, browserUuid } = require(path.resolve(__dirname, '../services/core/browser-crypto.ts'));
(async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    const cases = [
      new Uint8Array(),
      new TextEncoder().encode('abc'),
      new TextEncoder().encode('中文图片🎵'),
      nodeCrypto.randomBytes(65539),
    ];
    for (const crypto of [nodeCrypto.webcrypto, { getRandomValues: bytes => nodeCrypto.randomFillSync(bytes) }]) {
      Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true });
      for (const bytes of cases)
        assert.equal(await sha256Hex(bytes), nodeCrypto.createHash('sha256').update(bytes).digest('hex'));
      const ids = new Set(Array.from({ length: 100 }, browserUuid));
      assert.equal(ids.size, 100);
      for (const id of ids) assert.match(id, /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
    }
    const { storeResource } = require(path.resolve(__dirname, '../services/core/resource-storage.ts'));
    const data = new TextEncoder().encode('resource bytes');
    let uploaded;
    global.SillyTavern = { getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) };
    global.fetch = async (url, options) => {
      if (options.method === 'HEAD') return new Response(null, { status: 404 });
      uploaded = JSON.parse(options.body);
      return Response.json({ path: '/user/files/' + uploaded.name });
    };
    const result = await storeResource(new Blob([data], { type: 'image/png' }));
    const hash = nodeCrypto.createHash('sha256').update(data).digest('hex');
    assert.equal(result, `/user/files/wave-resource-${hash}.png`);
    assert.equal(uploaded.data, Buffer.from(data).toString('base64'));
    console.log('browser crypto: HTTPS/HTTP SHA-256 parity, UUIDs and HTTP resource upload passed');
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
