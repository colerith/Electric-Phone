require('./resource-server.cjs');
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
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { ImageProfileSchema, ImageReferenceSchema, CharacterImageSchema } = require(base + '/services/image/schema.ts');
const { parseVibeFile } = require(base + '/services/image/vibe.ts');
const { activeNovelAiReferences, generateImage } = require(base + '/services/image/generate.ts');
const { zipSync } = require('fflate');
const signal = new AbortController().signal;
(async () => {
  const imported = await parseVibeFile(
    JSON.stringify({
      identifier: 'novelai-vibe-transfer',
      name: 'Style',
      encodings: { v5curated: { hash: { encoding: 'cached-data', params: { information_extracted: 0.4 } } } },
      importInfo: { strength: 0.75 },
    }),
  );
  assert.equal(imported.informationExtracted, 0.4);
  assert.equal(imported.strength, 0.75);
  await assert.rejects(parseVibeFile('{}'), /naiv4vibe/);
  const disabled = ImageReferenceSchema.parse({ id: 'disabled', enabled: false });
  const profile = ImageProfileSchema.parse({ id: 'nai', apiKey: 'test', vibes: [imported, disabled] });
  const character = CharacterImageSchema.parse({ enabled: true, references: [{ ...imported, id: 'character' }] });
  assert.equal(activeNovelAiReferences(profile, character).length, 2);
  assert.equal(activeNovelAiReferences(profile, { ...character, references: [imported] }).length, 1);
  let calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(zipSync({ 'result.png': new Uint8Array([1, 2]) }));
  };
  await generateImage(profile, character, 'portrait', signal);
  assert.equal(calls.length, 1, 'matching Vibe cache bypasses encoding');
  assert.equal(calls[0].body.parameters.reference_image_multiple_cached.length, 2);
  assert.deepEqual(calls[0].body.parameters.reference_strength_multiple, [0.5, 0.5]);
  calls = [];
  global.fetch = async (url, init) => {
    if (url.startsWith('data:'))
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/png' } });
    calls.push({ url, body: JSON.parse(init.body) });
    return url.endsWith('encode-vibe')
      ? new Response(new Uint8Array(120))
      : new Response(zipSync({ 'result.png': new Uint8Array([1, 2]) }));
  };
  await generateImage(
    { ...profile, vibes: [{ ...imported, image: 'data:image/png;base64,AQI=', informationExtracted: 0.8 }] },
    { ...character, references: [] },
    'portrait',
    signal,
  );
  assert.equal(calls[0].body.information_extracted, 0.8, 'changed extraction must re-encode the original');
  assert(calls[0].url.endsWith('/encode-vibe'));
  console.log('PASS Vibe import, enable, merge/dedup, normalization, matching cache and extraction invalidation');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
