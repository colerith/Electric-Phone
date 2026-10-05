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
