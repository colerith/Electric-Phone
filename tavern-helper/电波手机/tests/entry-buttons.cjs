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
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { AppearanceSettingsSchema } = require(base + '/schemas.ts');
const defaults = AppearanceSettingsSchema.parse({});
assert.equal(defaults.floatingEntry, false);
assert.equal(defaults.quickReplyEntry, true);
assert.equal(defaults.extensionMenuEntry, false);
assert.equal(
  AppearanceSettingsSchema.parse({ floatingEntry: true }).floatingEntry,
  true,
  'existing floating preference survives upgrade',
);
const { syncPhoneQuickReply, PHONE_QUICK_REPLY_BUTTON } = require(base + '/services/core/entry-buttons.ts');
let buttons = [{ name: '用户自定义按钮', visible: true }],
  writes = 0;
global.getScriptButtons = () => buttons;
global.replaceScriptButtons = value => {
  buttons = value;
  writes++;
};
syncPhoneQuickReply(true);
assert.equal(buttons.length, 2);
syncPhoneQuickReply(true);
assert.equal(writes, 1, 'idempotent sync');
syncPhoneQuickReply(false);
assert.equal(buttons.find(b => b.name === PHONE_QUICK_REPLY_BUTTON).visible, false);
assert.equal(buttons[0].visible, true, 'other script buttons preserved');
syncPhoneQuickReply(true);
assert.equal(buttons.length, 2, 'reenabling never duplicates the entry');
assert.equal(buttons[1].visible, true);
console.log(
  'PASS entry defaults, preference migration, visibility toggling, idempotence and unrelated button preservation',
);

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="extensionsMenu"></div><form id="send_form"><textarea></textarea></form>');
global.window = dom.window;
global.document = dom.window.document;
const { EventEmitter } = require('events');
const source = new EventEmitter();
window.SillyTavern = {getContext: () => ({eventSource: source})};
const bridge = require(base + '/extension/bridge.ts');
const { syncPhoneMenu } = require(base + '/services/core/entry-buttons.ts');
let opened = 0;
source.on(bridge.getButtonEvent(''), () => opened++);
bridge.replaceScriptButtons([{name: PHONE_QUICK_REPLY_BUTTON, visible: true}]);
assert.equal(document.querySelectorAll('#wave-phone-quick-reply button').length, 1);
assert.equal(document.querySelector('#wave-phone-extension-menu'), null);
document.querySelector('#wave-phone-quick-reply button').click();
assert.equal(opened, 1);
syncPhoneMenu(true, () => opened++);
bridge.replaceScriptButtons([{name: PHONE_QUICK_REPLY_BUTTON, visible: false}]);
assert.equal(document.querySelector('#wave-phone-quick-reply'), null);
assert.ok(document.querySelector('#wave-phone-extension-menu'));
document.querySelector('#wave-phone-extension-menu').click();
assert.equal(opened, 2);
bridge.replaceScriptButtons([{name: PHONE_QUICK_REPLY_BUTTON, visible: true}]);
bridge.replaceScriptButtons([{name: PHONE_QUICK_REPLY_BUTTON, visible: true}]);
syncPhoneMenu(false, () => {});
assert.equal(document.querySelectorAll('#wave-phone-quick-reply').length, 1);
assert.equal(document.querySelector('#wave-phone-extension-menu'), null);
assert.ok(document.querySelector('#send_form textarea'));
console.log('PASS independent menu/quick-reply toggles, click actions and duplicate prevention');
