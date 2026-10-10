require('./resource-server.cjs');
const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { ImageProfileSchema, CharacterImageSchema, IMAGE_MODELS } = require(base + '/services/image/schema.ts');
const { generateImage, novelAiBody, fetchImageModels, imageApiRoot } = require(base + '/services/image/generate.ts');
const { importBaibaiProfiles } = require(base + '/services/image/baibai.ts');
const { VoiceServicesSchema, CharacterVoiceSchema, speechRequest, fetchFishModels } = require(
  base + '/services/chat/speech.ts',
);
const { zipSync } = require('fflate');
const nai = ImageProfileSchema.parse({ id: 'nai', apiKey: 'test-key' });
const openai = ImageProfileSchema.parse({
  id: 'gpt',
  provider: 'openai',
  model: IMAGE_MODELS.openai[0],
  apiKey: 'test-key',
});
const character = CharacterImageSchema.parse({ enabled: true, profileId: 'nai', prefix: 'red hair' });
const signal = new AbortController().signal;
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
(async () => {
  const services = VoiceServicesSchema.parse({
    fish: { enabled: true, apiKey: 'fish-test', model: 'drama-3-preview' },
  });
  const voice = CharacterVoiceSchema.parse({ provider: 'fish', voiceId: 'voice123', speed: 1.2 });
  const request = speechRequest('hello', services, voice);
  assert.equal(request.url, 'https://api.fish.audio/v1/tts');
  assert.equal(request.init.headers.model, 'drama-3-preview');
  assert.equal(request.init.headers.Authorization, 'Bearer fish-test');
  assert.deepEqual(JSON.parse(request.init.body), {
    text: 'hello',
    reference_id: 'voice123',
    format: 'mp3',
    prosody: { speed: 1.2 },
  });
  global.fetch = async () =>
    json({ paths: { '/v1/tts': { post: { parameters: [{ name: 'model', schema: { enum: ['future-fish'] } }] } } } });
  assert.deepEqual(await fetchFishModels(), [
    'future-fish',
    's1',
    's2-pro',
    's2.1-pro',
    's2.1-pro-free',
    'drama-3-preview',
  ]);
  global.fetch = async () => json({ data: [{ id: 'gpt-image-future' }, { id: 'text-model' }] });
  const fetched = await fetchImageModels(openai);
  assert(
    fetched.includes('gpt-image-future') && fetched.includes(IMAGE_MODELS.openai[0]) && fetched.includes('text-model'),
  );
  global.fetch = async () => json({ models: [null, {}, ' proxy-art ', { name: 'proxy-art' }] });
  assert.equal((await fetchImageModels(openai)).filter(id => id === 'proxy-art').length, 1);
  global.fetch = async () => json({ data: { id: 'bad-format' } });
  await assert.rejects(fetchImageModels(openai), /格式/);
  for (const suffix of ['/v1', '/v1/models/', '/v1/images/generations', '/v1/images/edits', '/images/generations'])
    assert.equal(
      imageApiRoot({ ...openai, baseUrl: `https://proxy.example/api${suffix}` }),
      'https://proxy.example/api',
    );
  for (const suffix of ['/ai', '/ai/models', '/ai/generate-image/', '/ai/encode-vibe'])
    assert.equal(
      imageApiRoot({ ...nai, baseUrl: `https://proxy.example/prefix${suffix}` }),
      'https://proxy.example/prefix',
    );
  assert.throws(() => imageApiRoot({ ...openai, baseUrl: 'proxy.example' }), /完整/);
  global.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(fetchImageModels(nai), /404/);
  assert(IMAGE_MODELS.novelai.includes('nai-diffusion-5-full'));
  assert.equal(imageApiRoot({ ...openai, baseUrl: 'https://proxy.example/api/v1' }), 'https://proxy.example/api');
  assert.throws(() => imageApiRoot({ ...nai, baseUrl: 'javascript:alert(1)' }));
  const body = novelAiBody(nai, character, 'reading');
  assert.equal(body.parameters.params_version, 4);
  assert.equal(body.input, 'red hair, reading');
  assert.equal(body.parameters.v4_prompt.caption.base_caption, body.input);
  assert.throws(() => novelAiBody({ ...nai, width: 1000 }, character, 'test'), /64/);
  const original = {
    nai: {
      model: 'nai-diffusion-5-full',
      endpoints: [{ id: 'a', name: 'A', url: 'https://image.novelai.net', key: 'test' }],
      artistPresets: [{ id: 'art', prompt: 'artist', quality: 'quality', negative: 'negative' }],
      activeArtistId: 'art',
    },
  };
  const before = JSON.stringify(original);
  const imported = importBaibaiProfiles(original, [openai]);
  imported.profiles[1].vibes = [
    require(base + '/services/image/schema.ts').ImageReferenceSchema.parse({ id: 'keep-style' }),
  ];
  const again = importBaibaiProfiles(original, imported.profiles);
  assert.equal(again.profiles[1].vibes[0].id, 'keep-style');
  assert.equal(again.profiles.length, 2);
  assert.equal(again.profiles[1].prefix, 'artist, quality');
  assert.equal(again.profiles[1].negative, 'negative');
  assert.equal(JSON.stringify(original), before);
  let calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return json({ data: [{ b64_json: 'cGl4ZWw=' }] });
  };
  assert.match(await generateImage(openai, character, 'reading', signal), /^\/user\/files\/wave-resource-/);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(JSON.parse(calls[0].init.body).prompt, 'red hair, reading');
  calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('data:'))
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/png' } });
    return json({ data: [{ b64_json: 'AQID' }] });
  };
  const reference = { id: 'ref', name: 'ref', image: 'data:image/png;base64,AQ==', strength: 0.6, encodings: {} };
  await generateImage(openai, { ...character, references: [reference] }, 'reading', signal);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits');
  assert(calls[0].init.body instanceof FormData);
  assert(calls[0].init.body.get('image[]') instanceof Blob);
  assert(!calls[0].init.headers['Content-Type']);
  calls = [];
  await generateImage(
    openai,
    {
      ...character,
      references: [
        { ...reference, enabled: false },
        { ...reference, strength: 0 },
      ],
    },
    'reading',
    signal,
  );
  assert.equal(calls.length, 1, 'disabled references must not be fetched');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(JSON.parse(calls[0].init.body).prompt, 'red hair, reading');
  calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(zipSync({ 'image_0.png': new Uint8Array([1, 2, 3]) }));
  };
  const encoded = { ...reference, image: '', encodings: { v5curated: { encoding: 'encoded', infoExtracted: 1 } } };
  assert.match(await generateImage(nai, { ...character, references: [encoded] }, 'reading', signal), /^\/user\/files\/wave-resource-/);
  assert.equal(calls.length, 1);
  const submitted = JSON.parse(calls[0].init.body);
  assert.equal(submitted.parameters.reference_image_multiple_cached[0].data, 'encoded');
  assert.deepEqual(submitted.parameters.reference_strength_multiple, [0.6]);
  global.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(generateImage(openai, character, 'reading', signal), /401/);
  await assert.rejects(generateImage(openai, { ...character, enabled: false }, 'reading', signal), /启用/);
  console.log(
    'PASS Fish models/payload; image models, NAI5/GPT generation & edits, Vibe, errors; BaiBai idempotent import',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
