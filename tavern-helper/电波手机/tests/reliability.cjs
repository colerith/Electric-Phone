const fs = require('node:fs'),
  path = require('node:path'),
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
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const schema = require(base + '/schemas.ts');
const { diagnostics } = require(base + '/services/core/diagnostics.ts');
const { describeRequestError } = require(base + '/services/core/request-error.ts');
const { validatePhoneBlocks } = require(base + '/services/generation/parser.ts');
const { cachedParse } = require(base + '/services/core/local-cache.ts');
const { generatePhoneReply, testSecondaryApi } = require(base + '/services/generation/generation.ts');
let chat = 'one',
  vars = { global: {}, script: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chat, characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
  stopGenerationById: async () => true,
});
async function run() {
  const { createPinia, setActivePinia } = require('pinia');
  setActivePinia(createPinia());
  const store = require(base + '/stores/phone.ts').usePhoneStore();
  store.settings.basic.cacheEnabled = false;
  await store.synchronize();
  assert.equal(store.isReady, true);
  assert.deepEqual(store.activeThread.historyArchive, [], 'new threads must include defaults immediately');
  assert.equal(store.activeThread.clearRevision, 0);
  // A persisted main-character roster can recreate an empty placeholder before multi-mode cleanup.
  const placeholder = { ...store.activeIdentity, actorType: 'main' };
  const second = { ...placeholder, charKey: 'id:second', source: 'parsed', name: 'Bob' };
  vars.global[schema.CARD_ROSTER_VARIABLE_KEY] = {
    identifier: schema.WAVE_PHONE_IDENTIFIER,
    version: schema.WAVE_PHONE_STORAGE_VERSION,
    data: { 'character:1': { [placeholder.charKey]: placeholder, [second.charKey]: second } },
  };
  for (const nextChat of ['two', 'three']) {
    chat = nextChat;
    vars.chat = {};
    await store.synchronize();
    assert.equal(store.syncError, '', 'global roster must not brick every new chat');
    assert.equal(store.isReady, true);
  }
  let records = [
    {
      key: JSON.stringify(['card', 'chat']),
      card: 'card',
      chat: 'chat',
      signature: 'same',
      value: undefined,
      size: 2,
      time: 1,
    },
  ];
  const request = result => {
    const r = { result };
    queueMicrotask(() => r.onsuccess?.());
    return r;
  };
  global.indexedDB = {
    open: () =>
      request({
        close() {},
        transaction() {
          const tx = {
            objectStore: () => ({
              getAll: () => request(records),
              delete: key => {
                records = records.filter(r => r.key !== key);
              },
              put: row => records.push(row),
            }),
          };
          queueMicrotask(() => tx.oncomplete?.());
          return tx;
        },
      }),
  };
  let reparses = 0;
  assert.deepEqual(
    await cachedParse(
      'card',
      'chat',
      'same',
      10,
      () => {
        reparses++;
        return [];
      },
      validatePhoneBlocks,
    ),
    [],
  );
  assert.equal(reparses, 1);
  await cachedParse(
    'card',
    'chat',
    'same',
    10,
    () => {
      reparses++;
      return [];
    },
    validatePhoneBlocks,
  );
  assert.equal(reparses, 1, 'repaired cache should be reusable');
  assert(diagnostics.logs.some(l => l.event === '解析缓存回退'));

  const settings = schema.ScriptSettingsSchema.parse({
    api: { enabled: true, model: 'test', apiurl: 'https://example.com/v1', key: 'secret-test-key' },
  });
  const input = {
    settings,
    cardKey: 'character:1',
    chatKey: chat,
    cardName: 'Alice',
    identity: store.identities[0],
    thread: schema.ThreadSchema.parse({ id: 't', charKey: 'a', updatedAt: '' }),
    appSnapshot: schema.AppSnapshotSchema.parse({}),
    latestUserText: 'hello',
  };
  global.generateRaw = async () => 'WAVE_OK';
  assert.equal(await testSecondaryApi(settings), 'WAVE_OK');
  await assert.rejects(generatePhoneReply(input), /回复格式不匹配/);
  global.generateRaw = async () => '{"messages":[{"sender":42,"content":"hello"}]}';
  await assert.rejects(generatePhoneReply(input), /messages/);
  global.generateRaw = async () => undefined;
  await assert.rejects(testSecondaryApi(settings), /响应类型不匹配/);
  global.generateRaw = async () => '';
  await assert.rejects(testSecondaryApi(settings), /空响应/);
  global.generateRaw = async () => {
    throw { status: 401, message: 'bad secret-test-key' };
  };
  await assert.rejects(testSecondaryApi(settings), /鉴权或权限/);
  assert(!JSON.stringify(diagnostics.logs).includes('secret-test-key'));
  settings.api.retryCount = 1;
  let calls = 0;
  global.generateRaw = async () => {
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return 'WAVE_OK';
  };
  await testSecondaryApi(settings);
  assert.equal(calls, 2);
  assert(diagnostics.logs.some(l => l.event === '自动重试'));
  settings.api.retryCount = 0;
  settings.api.timeoutMs = 5;
  global.generateRaw = () => new Promise(() => {});
  await assert.rejects(testSecondaryApi(settings), /请求超时/);
  settings.api.enabled = false;
  await assert.rejects(testSecondaryApi(settings), /配置错误/);
  assert.match(diagnostics.logs[0].detail, /配置检查/);
  assert.equal(
    describeRequestError({ status: 400, message: 'maximum context length exceeded' }, '请求接口').category,
    '上下文超限',
  );
  assert.equal(describeRequestError({ status: 503, message: 'unavailable' }, '请求接口').category, '服务端故障');
  assert.equal(describeRequestError({ status: 429 }, '请求接口').category, '限流或配额');
  console.log(
    'PASS: global roster recovery, complete thread defaults, corrupted cache rebuild, API stages, error categories, retries, timeout and secret redaction.',
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
