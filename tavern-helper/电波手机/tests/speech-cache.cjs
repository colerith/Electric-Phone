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
// Persisted object-store mock survives module reload, unlike component memory.
const records = new Map();
global.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        close() {},
        transaction() {
          const tx = {
            objectStore() {
              return {
                get(key) {
                  const r = {};
                  queueMicrotask(() => {
                    r.result = records.get(key);
                    r.onsuccess();
                  });
                  return r;
                },
                put(blob, key) {
                  records.set(key, blob);
                  queueMicrotask(() => tx.oncomplete());
                },
              };
            },
          };
          return tx;
        },
      };
      req.onsuccess();
    });
    return req;
  },
};
(async () => {
  const speech = require(base + '/services/chat/speech.ts');
  const services = speech.VoiceServicesSchema.parse({ fish: { enabled: true, apiKey: 'secret' } });
  const voice = speech.CharacterVoiceSchema.parse({ provider: 'fish', voiceId: 'speaker' });
  const key = speech.speechCacheKey('hello', services, voice);
  assert(!key.includes('secret'));
  assert.equal(
    key,
    speech.speechCacheKey('hello', { ...services, fish: { ...services.fish, apiKey: 'changed' } }, voice),
  );
  assert.notEqual(key, speech.speechCacheKey('different', services, voice));
  assert.notEqual(key, speech.speechCacheKey('hello', services, { ...voice, speed: 1.5 }));
  let calls = 0;
  const generate = async () => {
    calls++;
    return new Blob(['audio'], { type: 'audio/mpeg' });
  };
  const file = base + '/services/chat/speech-cache.ts';
  await require(file).cachedSpeech(key, generate);
  delete require.cache[require.resolve(file)];
  assert.equal(await (await require(file).cachedSpeech(key, generate)).text(), 'audio');
  assert.equal(calls, 1, 'reload reuses persisted audio');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(require(file).cachedSpeech('cancelled', generate, controller.signal));
  assert.equal(calls, 1);
  await assert.rejects(
    require(file).cachedSpeech('failed', async () => {
      throw Error('failed');
    }),
  );
  assert(!records.has('failed'));
  console.log(
    'PASS durable speech reuse after module reload, parameter invalidation, credential exclusion, cancellation and failure',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
