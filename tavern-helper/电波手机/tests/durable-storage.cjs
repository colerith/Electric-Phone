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
const schema = require('../schemas.ts');
const server = new Map();
let vars = { global: {}, chat: {}, script: {} },
  chatId = 'chat-one',
  failUpload = false,
  failRead = false;
let onRead;
let uploads = 0,
  settingsSaves = 0;
Object.assign(global, {
  SillyTavern: {
    extensionSettings: {},
    saveSettingsDebounced: async () => {
      settingsSaves++;
    },
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    getCurrentChatId: () => chatId,
    characterId: '0',
    name1: 'User',
  },
  getCharData: () => ({ name: 'Alice', avatar: 'Alice.png' }),
  getCharAvatarPath: () => '/Alice.png',
  getVariables: ({ type }) => vars[type],
  replaceVariables: (value, { type }) => {
    vars[type] = value;
  },
  fetch: async (url, init = {}) => {
    if (init.method === 'POST') {
      uploads++;
      if (failUpload) return new Response('', { status: 503 });
      const body = JSON.parse(init.body);
      server.set(body.name, Buffer.from(body.data, 'base64').toString('utf8'));
      return Response.json({ path: '/files/' + body.name });
    }
    if (onRead) await onRead(url);
    if (failRead) return new Response('', { status: 503 });
    const value = server.get(url.split('/').at(-1));
    return value === undefined
      ? new Response('', { status: 404 })
      : new Response(value, { headers: { 'Content-Type': 'application/json' } });
  },
});
const { getRuntimeContext } = require('../services/core/identity.ts');
const storagePath = require.resolve('../services/core/durable-storage.ts');
function restart() {
  delete require.cache[storagePath];
  return require(storagePath);
}
const wrap = data => ({ identifier: schema.WAVE_PHONE_IDENTIFIER, version: schema.WAVE_PHONE_STORAGE_VERSION, data });
function state(content) {
  const runtime = getRuntimeContext();
  return schema.ChatStateSchema.parse({
    cardKey: runtime.cardKey,
    chatKey: runtime.chatKey,
    threads: {
      alice: {
        id: 'alice',
        charKey: 'alice',
        updatedAt: '2026-10-05T00:00:00Z',
        messages: content ? [{ id: 'm1', sender: 'user', content, createdAt: '2026-10-05T00:00:00Z' }] : [],
      },
    },
  });
}
(async () => {
  let storage = restart();
  await storage.preparePhoneStorage();
  await storage.preparePhoneChat(getRuntimeContext());
  storage.writePhoneGlobals({
    unrelated: 42,
    [schema.SCRIPT_VARIABLE_KEY]: wrap(schema.ScriptSettingsSchema.parse({ api: { key: 'test-key', model: 'test' } })),
  });
  const beforeBatch = settingsSaves;
  storage.batchPhoneStorage(() => {
    for (let i = 0; i < 4; i++) {
      const current = storage.readPhoneGlobals();
      storage.writePhoneGlobals({ ...current, [schema.USER_PROFILE_VARIABLE_KEY]: wrap({}) });
      assert.ok(storage.readPhoneGlobals()[schema.USER_PROFILE_VARIABLE_KEY]);
    }
  });
  assert.equal(settingsSaves - beforeBatch, 1, 'four related writes produce one settings save');
  storage.setPhoneStorageInterval(60);
  storage.writePhoneChat(state('服务器保留消息'));
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(uploads, 0, 'configured interval does not upload after the old 350ms delay');
  await storage.flushPhoneStorage();
  assert.equal(storage.phoneStorageStatus.pending, 0);
  assert.equal(server.size, 2);
  assert.equal(vars.global.unrelated, 42);
  assert(![...server.values()].some(json => json.includes('unrelated')));
  const uploaded = uploads,
    saved = settingsSaves;
  const revision = vars.chat.wave_phone_saved_at;
  for (let i = 0; i < 10; i++) {
    storage.writePhoneGlobals(vars.global);
    storage.writePhoneChat(state('服务器保留消息'));
  }
  await storage.flushPhoneStorage();
  assert.equal(uploads, uploaded, 'identical global/chat writes do not upload');
  assert.equal(settingsSaves, saved, 'identical global writes do not emit settings saves');
  assert.equal(vars.chat.wave_phone_saved_at, revision);
  // A new browser has neither helper variables nor an extension-settings manifest.
  vars = { global: {}, chat: {}, script: {} };
  SillyTavern.extensionSettings = {};
  storage = restart();
  await storage.preparePhoneStorage();
  await storage.preparePhoneChat(getRuntimeContext());
  assert.equal(vars.global[schema.SCRIPT_VARIABLE_KEY].data.api.key, 'test-key');
  assert.equal(vars.chat[schema.CHAT_VARIABLE_KEY].threads.alice.messages[0].content, '服务器保留消息');
  // Saving fails visibly, preserves the last disk snapshot and retains the new write for retry.
  failUpload = true;
  storage.writePhoneChat(state('重试后的新消息'));
  const beforeFailure = [...server.entries()];
  await assert.rejects(storage.flushPhoneStorage(), /503/);
  assert.equal(storage.phoneStorageStatus.pending, 1);
  assert.deepEqual([...server.entries()], beforeFailure);
  failUpload = false;
  await storage.flushPhoneStorage();
  assert.equal(server.size, 3, 'two alternating chat snapshots');
  assert.equal(storage.phoneStorageStatus.error, '');
  // Card-list reordering does not change identity.
  const originalKey = getRuntimeContext().cardKey;
  SillyTavern.characterId = '99';
  assert.equal(getRuntimeContext().cardKey, originalKey);
  vars.chat = {};
  storage = restart();
  await storage.preparePhoneChat(getRuntimeContext());
  assert.equal(vars.chat[schema.CHAT_VARIABLE_KEY].threads.alice.messages[0].content, '重试后的新消息');
  // An intentional clear is valid data; recovery must not resurrect deleted messages.
  storage.writePhoneChat(state(''));
  await storage.flushPhoneStorage();
  vars.chat = {};
  storage = restart();
  await storage.preparePhoneChat(getRuntimeContext());
  assert.deepEqual(vars.chat[schema.CHAT_VARIABLE_KEY].threads.alice.messages, []);
  // Corrupt latest snapshot falls back to previous valid snapshot.
  const chatFiles = [...server.entries()].filter(([name]) => !name.includes('global'));
  chatFiles.sort((a, b) => JSON.parse(b[1]).savedAt - JSON.parse(a[1]).savedAt);
  server.set(chatFiles[0][0], '{broken');
  vars.chat = {};
  storage = restart();
  await storage.preparePhoneChat(getRuntimeContext());
  assert.equal(vars.chat[schema.CHAT_VARIABLE_KEY].threads.alice.messages[0].content, '重试后的新消息');
  assert(storage.phoneStorageStatus.recovery);
  // No blank replacement when both server copies are unreadable.
  server.set(chatFiles[1][0], '{broken');
  vars.chat = {};
  storage = restart();
  await assert.rejects(storage.preparePhoneChat(getRuntimeContext()));
  assert.deepEqual(vars.chat, {});
  // Restore valid server snapshots for context-switch isolation.
  for (const [name, json] of chatFiles) server.set(name, json);
  vars.chat = {};
  storage = restart();
  let release;
  const paused = new Promise(resolve => {
    release = resolve;
  });
  onRead = () => paused;
  const preparing = storage.preparePhoneChat(getRuntimeContext());
  chatId = 'other-chat';
  release();
  await preparing;
  onRead = undefined;
  assert.deepEqual(vars.chat, {});
  await storage.preparePhoneChat(getRuntimeContext());
  assert.deepEqual(vars.chat, {});
  assert.throws(() => storage.writePhoneChat({ ...state(''), chatKey: 'chat-one' }), /聊天已切换/);
  chatId = 'chat-one';
  await storage.preparePhoneChat(getRuntimeContext());
  assert(vars.chat[schema.CHAT_VARIABLE_KEY]);
  // Network failures do not masquerade as 'no data'.
  failRead = true;
  storage = restart();
  vars.global = {};
  SillyTavern.extensionSettings = {};
  await assert.rejects(storage.preparePhoneStorage(), /503/);
  assert.deepEqual(vars.global, {});
  failRead = false;
  await storage.preparePhoneStorage();
  // A failed post-import server save must keep both the applied UI state and retry snapshot.
  const { zipSync, strToU8 } = require('fflate');
  const imported = new File(
    [
      zipSync({
        'backup.json': strToU8(
          JSON.stringify({
            format: 'wave-phone-backup',
            formatVersion: 2,
            identifier: schema.WAVE_PHONE_IDENTIFIER,
            storageVersion: 1,
            exportedAt: '2026-10-05T00:00:00Z',
            context: getRuntimeContext(),
            modules: { general: { settings: { api: { model: 'imported-model', key: 'imported-key' } } } },
          }),
        ),
      }),
    ],
    'import.zip',
  );
  let applied = false;
  failUpload = true;
  await assert.rejects(
    require('../services/core/backup.ts').importPhoneBackup(imported, ['general'], async () => {
      applied = true;
      assert.equal(storage.readPhoneGlobals()[schema.SCRIPT_VARIABLE_KEY].data.api.model, 'imported-model');
    }),
    /503/,
  );
  assert(applied);
  assert(storage.phoneStorageStatus.pending > 0);
  failUpload = false;
  await storage.flushPhoneStorage();
  assert.equal(storage.readPhoneGlobals()[schema.SCRIPT_VARIABLE_KEY].data.api.model, 'imported-model');
  console.log(
    'PASS: server recovery without browser state, two snapshots, retry, deliberate deletion, corrupt data and chat-switch isolation.',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
