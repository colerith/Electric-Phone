const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
const p = process.cwd() + '/src/util/酒馆助手脚本/电波手机';
const { synthesizeSpeech, VoiceServicesSchema, CharacterVoiceSchema } = require(p + '/services/chat/speech.ts');
const { diagnostics } = require(p + '/services/core/diagnostics.ts');
const services = VoiceServicesSchema.parse({ fish: { enabled: true, apiKey: 'test-secret' } }),
  voice = CharacterVoiceSchema.parse({ provider: 'fish', voiceId: 'voice' });
global.SillyTavern = { getRequestHeaders: () => ({ 'X-CSRF-Token': 'local-token' }) };
(async () => {
  let calls = [];
  global.fetch = async (url, init) => {
    calls.push(url);
    return new Response(new Blob(['audio'], { type: 'audio/mpeg' }));
  };
  assert((await synthesizeSpeech('hello', services, voice)).size > 0);
  assert(calls[0].startsWith('/proxy/'));
  let n = 0;
  global.fetch = async () =>
    ++n === 1
      ? new Response('CORS proxy is disabled', { status: 404 })
      : new Response(new Blob(['audio'], { type: 'audio/mpeg' }));
  await synthesizeSpeech('hello', services, voice);
  assert.equal(n, 2);
  global.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(synthesizeSpeech('hello', services, voice), /语音连接失败/);
  assert(diagnostics.logs.some(x => x.event === '语音合成失败'));
  assert(!JSON.stringify(diagnostics.logs).includes('test-secret'));
  global.fetch = async () => new Response('test-secret invalid', { status: 401 });
  await assert.rejects(synthesizeSpeech('hello', services, voice), /HTTP 401/);
  assert(!JSON.stringify(diagnostics.logs).includes('test-secret'));
  console.log('PASS voice proxy, disabled fallback, network diagnostics and secret redaction');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
