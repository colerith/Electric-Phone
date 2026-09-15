const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');

require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );
global._ = require('lodash');
global.z = require('zod').z;

let chatKey = 'backup-chat';
const variables = { global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chatKey, characterId: '1', groupId: '' },
  getCharData: () => ({ name: 'Alice', avatar: 'alice.png' }),
  getCharAvatarPath: () => '/alice.png',
  getVariables: ({ type }) => variables[type],
  replaceVariables: (value, { type }) => (variables[type] = value),
});

const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const schemas = require(base + '/schemas.ts');
const { createPhoneBackup, importPhoneBackup } = require(base + '/services/backup.ts');
const wrap = data => ({
  identifier: schemas.WAVE_PHONE_IDENTIFIER,
  version: schemas.WAVE_PHONE_STORAGE_VERSION,
  data,
});

(async () => {
  variables.global[schemas.SCRIPT_VARIABLE_KEY] = wrap({ api: { enabled: true, key: 'secret', model: 'test' } });
  variables.global[schemas.PROFILE_VARIABLE_KEY] = wrap({});
  variables.global[schemas.USER_PROFILE_VARIABLE_KEY] = wrap({});
  variables.global[schemas.CARD_ROSTER_VARIABLE_KEY] = wrap({});
  variables.chat[schemas.CHAT_VARIABLE_KEY] = schemas.ChatStateSchema.parse({
    cardKey: 'character:1',
    chatKey,
    activeCharKey: 'alice',
  });

  const exported = createPhoneBackup();
  assert(exported.filename.endsWith('.zip'));
  const file = new File([await exported.blob.arrayBuffer()], exported.filename, { type: 'application/zip' });
  variables.global[schemas.SCRIPT_VARIABLE_KEY] = wrap({});
  variables.chat[schemas.CHAT_VARIABLE_KEY] = schemas.ChatStateSchema.parse({});
  const restored = await importPhoneBackup(file);
  assert.equal(restored.chatImported, true);
  assert.equal(variables.global[schemas.SCRIPT_VARIABLE_KEY].data.api.key, 'secret');
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].activeCharKey, 'alice');

  chatKey = 'different-chat';
  variables.chat[schemas.CHAT_VARIABLE_KEY] = schemas.ChatStateSchema.parse({ chatKey });
  const mismatched = await importPhoneBackup(file);
  assert.equal(mismatched.chatImported, false);
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].chatKey, 'different-chat');
  console.log('PASS: ZIP export/import, private settings restoration, schema validation and chat mismatch protection.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
