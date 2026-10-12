const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<form id="send_form"><div id="qr--bar"></div></form>');
Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  MutationObserver: dom.window.MutationObserver,
});
let clicked = 0;
window.SillyTavern = { getContext: () => ({ eventSource: { emit: () => clicked++ } }) };
const output = ts.transpileModule(fs.readFileSync(require.resolve('../extension/bridge.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exportsObject = {};
new Function('exports', output)(exportsObject);
(async () => {
  exportsObject.replaceScriptButtons([{ name: '电波手机', visible: true }]);
  assert(
    document.querySelector('#qr--bar > #wave-phone-quick-reply.qr--buttons .qr--button.menu_button .qr--button-label'),
  );
  document.querySelector('.qr--button').click();
  assert.equal(clicked, 1);
  document.querySelector('#qr--bar').replaceChildren();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.querySelectorAll('#wave-phone-quick-reply').length, 1);
  exportsObject.replaceScriptButtons([{ name: '电波手机', visible: false }]);
  assert.equal(document.querySelectorAll('#wave-phone-quick-reply').length, 0);
  exportsObject.stopExtensionEvents();
  dom.window.close();
  console.log('PASS: native QR structure, click, toolbar rebuild and hide cleanup');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
