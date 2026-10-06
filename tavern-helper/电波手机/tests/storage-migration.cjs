const fs = require('node:fs'),
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
global.window = global;
const schema = require('../schemas.ts');
const variables = { global: {}, chat: {}, script: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => 'old-chat', characterId: '97' },
  getCharData: () => ({ name: 'Alice', avatar: 'Alice.png' }),
  getCharAvatarPath: () => '/Alice.png',
  getChatMessages: () => [],
  getVariables: ({ type }) => variables[type],
  replaceVariables: (v, { type }) => {
    variables[type] = v;
  },
});
const oldKey = 'character:1',
  now = '2026-10-05T00:00:00Z';
const wrap = data => ({ identifier: schema.WAVE_PHONE_IDENTIFIER, version: schema.WAVE_PHONE_STORAGE_VERSION, data });
variables.global[schema.SCRIPT_VARIABLE_KEY] = wrap(
  schema.ScriptSettingsSchema.parse({ api: { model: 'keep-model' }, basic: { cacheEnabled: false } }),
);
const identity = schema.IdentitySchema.parse({
  charKey: 'alice',
  stableId: 'alice',
  name: 'Alice',
  source: 'local_contact',
  createdAt: now,
  updatedAt: now,
});
variables.global[schema.CARD_ROSTER_VARIABLE_KEY] = wrap({ [oldKey]: { alice: identity } });
variables.global[schema.PROFILE_VARIABLE_KEY] = wrap(
  schema.CharacterProfileMapSchema.parse({ [`${oldKey}::alice`]: { remark: '旧联系人备注', updatedAt: now } }),
);
variables.chat[schema.CHAT_VARIABLE_KEY] = schema.ChatStateSchema.parse({
  cardKey: oldKey,
  chatKey: 'old-chat',
  identities: { alice: identity },
  threads: {
    old: {
      id: 'old',
      charKey: 'alice',
      updatedAt: now,
      messages: [{ id: 'old-message', sender: 'user', content: '旧聊天不能丢', createdAt: now }],
    },
  },
});
const { CHARACTER_DEFAULTS_KEY, CharacterDefaultsSchema } = require('../services/core/character-defaults.ts');
const {
  WalletBookSchema,
  ensureWalletAccounts,
  deleteAccount,
  replayWalletAuthorization,
} = require('../services/wallet/wallet-accounts.ts');
const wrongBook = WalletBookSchema.parse({});
ensureWalletAccounts(wrongBook, 'other', 'Other');
wrongBook.accounts['char:other'].opening.CNY = 9999;
variables.global[CHARACTER_DEFAULTS_KEY] = wrap({ [oldKey]: CharacterDefaultsSchema.parse({ walletBook: wrongBook }) });
const ownBook = variables.chat[schema.CHAT_VARIABLE_KEY].walletBook;
ensureWalletAccounts(ownBook, 'alice', 'Alice');
ownBook.accounts['char:alice'].opening.CNY = 123;
ownBook.grants.invalid = undefined;
ownBook.grants.nullGrant = null;
const repaired = WalletBookSchema.parse(ownBook);
assert(!Object.hasOwn(repaired.grants, 'invalid'));
assert(!Object.hasOwn(repaired.grants, 'nullGrant'));
const valid = replayWalletAuthorization(repaired, 'old-floor', 'alice');
assert(valid);
deleteAccount(repaired, 'char:alice');
assert.equal(replayWalletAuthorization(repaired, 'old-floor', 'alice'), undefined);
assert.equal(replayWalletAuthorization(repaired, 'new-floor', 'alice'), undefined);
assert(!Object.hasOwn(repaired.grants, 'new-floor'));
assert(repaired.grants['old-floor'], 'deleted historical grant retains routing evidence');
WalletBookSchema.parse(repaired);
(async () => {
  const { createPinia, setActivePinia } = require('pinia');
  setActivePinia(createPinia());
  const phone = require('../stores/phone.ts').usePhoneStore();
  await phone.synchronize();
  assert(phone.isReady, phone.syncError);
  const currentKey = phone.context.cardKey;
  assert.equal(currentKey, 'character-file:Alice.png');
  assert(!phone.state.walletBook.accounts['char:other'], 'legacy index wallet must not cross cards');
  assert.equal(phone.state.walletBook.accounts['char:alice'].opening.CNY, 123);
  assert(
    variables.global[CHARACTER_DEFAULTS_KEY].data[oldKey].walletBook.accounts['char:other'],
    'retain legacy backup',
  );
  assert(phone.state.identities.alice);
  assert(Object.values(phone.state.threads).some(t => t.messages.some(m => m.content === '旧聊天不能丢')));
  assert.equal(variables.global[schema.PROFILE_VARIABLE_KEY].data[`${currentKey}::alice`].remark, '旧联系人备注');
  assert(variables.global[schema.CARD_ROSTER_VARIABLE_KEY].data[oldKey], 'preserve legacy data');
  assert.equal(phone.settings.api.model, 'keep-model');
  // Import a v2 backup made before stable card IDs existed.
  const { zipSync, strToU8 } = require('fflate');
  const backup = {
    format: 'wave-phone-backup',
    formatVersion: 2,
    identifier: schema.WAVE_PHONE_IDENTIFIER,
    storageVersion: 1,
    exportedAt: now,
    context: { cardKey: oldKey, chatKey: 'old-chat', cardName: 'Alice' },
    modules: { history: { chat: { threads: variables.chat[schema.CHAT_VARIABLE_KEY].threads } } },
  };
  const file = new File([zipSync({ 'backup.json': strToU8(JSON.stringify(backup)) })], 'old.zip');
  const result = await require('../services/core/backup.ts').importPhoneBackup(file, ['history']);
  assert(result.chatImported, result.message);
  // Another stable card must not silently claim an existing chat and overwrite it.
  variables.chat[schema.CHAT_VARIABLE_KEY].cardKey = 'character-file:Other.png';
  const before = JSON.stringify(variables.chat);
  await phone.synchronize();
  assert(phone.syncError.includes('归属不匹配'));
  assert.equal(JSON.stringify(variables.chat), before);
  phone.dispose();
  console.log(
    'PASS: stable card ID migration, old contacts/messages/profile retention, legacy backup import and wrong-card protection.',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
