require('./resource-server.cjs');
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
const cardKey = require(base + '/services/core/identity.ts').getRuntimeContext().cardKey;
const { createPhoneBackup, importPhoneBackup, inspectPhoneBackup } = require(base + '/services/core/backup.ts');
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
    cardKey,
    chatKey,
    activeCharKey: 'alice',
  });

  const cover = 'data:image/jpeg;base64,' + btoa('backup cover bytes');
  variables.global.wave_phone_character_defaults = wrap({
    [cardKey]: {
      artwork: { alice: { zone: cover } },
      walletBook: {
        accounts: { user: { id: 'user', name: '我的钱包', ownerType: 'user', ownerId: 'user', opening: { CNY: 123 } } },
      },
      migratedChats: [chatKey],
    },
  });
  const exported = await createPhoneBackup();
  assert(exported.filename.endsWith('.zip'));
  const file = new File([await exported.blob.arrayBuffer()], exported.filename, { type: 'application/zip' });
  variables.global[schemas.SCRIPT_VARIABLE_KEY] = wrap({});
  variables.chat[schemas.CHAT_VARIABLE_KEY] = schemas.ChatStateSchema.parse({});
  delete variables.global.wave_phone_character_defaults;
  const restored = await importPhoneBackup(file);
  assert.equal(restored.chatImported, true);
  assert.equal(variables.global.wave_phone_character_defaults.data[cardKey].walletBook.accounts.user.opening.CNY, 123);
  assert.equal(await (await fetch(variables.global.wave_phone_character_defaults.data[cardKey].artwork.alice.zone)).text(), 'backup cover bytes');
  assert.equal(variables.global[schemas.SCRIPT_VARIABLE_KEY].data.api.key, 'secret');
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].activeCharKey, 'alice');

  const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate');
  const { unpackBackupAssets } = require(base + '/services/core/backup-assets.ts');
  const archiveFiles = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const legacyJson = await unpackBackupAssets(
    JSON.parse(strFromU8(archiveFiles['backup.json'])),
    archiveFiles,
    50 * 1024 * 1024,
  );
  legacyJson.formatVersion = 1;
  delete legacyJson.payloadFormatVersion;
  delete legacyJson.assets;
  delete legacyJson.global.characterDefaults;
  const legacyFile = new File([zipSync({ 'backup.json': strToU8(JSON.stringify(legacyJson)) })], 'legacy.zip');
  await importPhoneBackup(legacyFile);
  assert.equal(variables.global.wave_phone_character_defaults.data[cardKey].walletBook.accounts.user.opening.CNY, 123);
  chatKey = 'different-chat';
  variables.chat[schemas.CHAT_VARIABLE_KEY] = schemas.ChatStateSchema.parse({ chatKey });
  const mismatched = await importPhoneBackup(file);
  assert.equal(mismatched.chatImported, false);
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].chatKey, 'different-chat');
  // Modular exports must contain only requested data, and import must leave other modules untouched.
  chatKey = 'backup-chat';
  await importPhoneBackup(file);
  const now = new Date().toISOString();
  const state = variables.chat[schemas.CHAT_VARIABLE_KEY];
  state.identities.bob = schemas.IdentitySchema.parse({
    charKey: 'bob',
    stableId: 'bob',
    name: 'Bob',
    about: '旅行朋友',
    source: 'local_contact',
    createdAt: now,
    updatedAt: now,
  });
  state.threads.bob = schemas.ThreadSchema.parse({
    id: 'bob',
    charKey: 'bob',
    updatedAt: now,
    messages: [{ id: 'private', sender: 'char', content: '私密聊天内容', createdAt: now }],
  });
  state.snapshots.bob = schemas.AppSnapshotSchema.parse({ memo: '{"notes":[]}', sourceMessageIds: [4] });
  const modular = await createPhoneBackup(['messages', 'history', 'memo']);
  const modularFile = new File([await modular.blob.arrayBuffer()], 'modules.zip');
  const data = JSON.parse(strFromU8(unzipSync(new Uint8Array(await modularFile.arrayBuffer()))['backup.json']));
  assert.deepEqual(await inspectPhoneBackup(modularFile), ['messages', 'history', 'memo']);
  assert.equal(data.global, undefined);
  assert.equal(data.chat, undefined);
  assert.equal(data.modules.messages.chat.threads, undefined);
  assert(!JSON.stringify(data.modules.messages).includes('私密聊天内容'));
  assert(!JSON.stringify(data).includes('secret'));
  assert.equal(data.modules.messages.roster.bob.about, '旅行朋友');
  assert.equal(data.modules.history.chat.threads.bob.messages[0].content, '私密聊天内容');
  chatKey = 'new-chat';
  variables.chat[schemas.CHAT_VARIABLE_KEY] = schemas.ChatStateSchema.parse({ cardKey, chatKey });
  await importPhoneBackup(modularFile, ['messages']);
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].identities.bob.about, '旅行朋友');
  assert.deepEqual(variables.chat[schemas.CHAT_VARIABLE_KEY].threads, {});
  assert.equal(variables.global[schemas.SCRIPT_VARIABLE_KEY].data.api.key, 'secret');
  const beforeMismatch = JSON.stringify(variables.chat);
  assert.equal((await importPhoneBackup(modularFile, ['history'])).chatImported, false);
  assert.equal(JSON.stringify(variables.chat), beforeMismatch);
  chatKey = 'backup-chat';
  variables.chat[schemas.CHAT_VARIABLE_KEY].snapshots.bob = schemas.AppSnapshotSchema.parse({ memo: 'keep memo' });
  await importPhoneBackup(modularFile, ['history']);
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].threads.bob.messages[0].content, '私密聊天内容');
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].snapshots.bob.memo, 'keep memo');
  await importPhoneBackup(modularFile, ['memo']);
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].restoredAppSnapshots.bob.memo, '{"notes":[]}');
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].appFloorCutoffs.bob.memo, 4);
  const beforeInvalid = JSON.stringify(variables);
  await assert.rejects(importPhoneBackup(modularFile, ['wallet']));
  assert.equal(JSON.stringify(variables), beforeInvalid);
  // Existing version 1 archives also support selecting individual modules.
  await importPhoneBackup(file, ['appearance']);
  assert.equal(variables.chat[schemas.CHAT_VARIABLE_KEY].threads.bob.messages[0].content, '私密聊天内容');
  console.log('PASS: ZIP export/import, private settings restoration, schema validation and chat mismatch protection.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
