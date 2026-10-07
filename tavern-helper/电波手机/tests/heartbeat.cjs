const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    f,
  );
global.document = new EventTarget();
document.hidden = false;
global.window = new EventTarget();
const { startHeartbeat } = require('../services/core/heartbeat.ts');
(async () => {
  let calls = 0,
    release;
  const stop = startHeartbeat(() => {
    calls++;
    return new Promise(resolve => {
      release = resolve;
    });
  }, 10);
  await new Promise(r => setTimeout(r, 40));
  assert.equal(calls, 1, 'no overlapping tasks');
  release();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(calls, 2);
  stop();
  release();
  window.dispatchEvent(new Event('focus'));
  await new Promise(r => setTimeout(r, 25));
  assert.equal(calls, 2, 'dispose stops timer and wake listeners');
  console.log('PASS heartbeat overlap guard, repeat and teardown');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
