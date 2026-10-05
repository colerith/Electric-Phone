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
global.z = require('zod').z;
global.window = global;
global.toastr = { info: () => {} };
let chat = 'test-chat',
  vars = { script: {}, chat: {} },
  floors = [];
global.SillyTavern = { name1: 'User', getCurrentChatId: () => chat, characterId: '1', groupId: '', characters: [] };
global.getCharData = () => ({ name: 'Alice', avatar: 'a.png' });
global.getCharAvatarPath = () => '/a.png';
global.getVariables = ({ type }) => vars[type];
global.replaceVariables = (v, { type }) => {
  vars[type] = v;
};
global.getChatMessages = range => (typeof range === 'number' ? floors.filter(m => m.message_id === range) : floors);
global.stopGenerationById = async () => true;
let rules = [];
global.getTavernRegexes = () => rules;
global.updateTavernRegexesWith = async fn => (rules = fn(rules));
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { createPinia, setActivePinia } = require('pinia');
setActivePinia(createPinia());
const { serializeDelta } = require(base + '/services/generation/module-protocol.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const store = usePhoneStore();
store.settings.basic.cacheEnabled = false;

const { ImageProfileSchema, CharacterImageSchema } = require(base + '/services/image/schema.ts');
const { createPhoneBackup, importPhoneBackup } = require(base + '/services/core/backup.ts');
const profiles = require(base + '/schemas.ts');
(async () => {
  await store.synchronize();
  store.settings.imageServices.profiles = [
    ImageProfileSchema.parse({
      id: 'image-api',
      provider: 'openai',
      model: 'gpt-image-2.5-sunburst',
      apiKey: 'test-only',
    }),
  ];
  store.saveSettings();
  store.setCharacterImage(CharacterImageSchema.parse({ enabled: true, profileId: 'image-api', prefix: 'red hair' }));
  assert.equal(store.characterImage.prefix, 'red hair');
  const originalThread = store.activeThread;
  global.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] }));
  await store.generateCharacterImage('reading', new AbortController().signal);
  assert.equal(store.activeThread.messages.at(-1).type, 'image');
  assert.equal(store.activeThread.messages.at(-1).payload.url, 'data:image/png;base64,AQID');
  assert.equal(store.activeThread.messages.at(-1).sender, 'char');
  const backup = createPhoneBackup(['general', 'messages', 'history']);
  store.setCharacterImage(CharacterImageSchema.parse({}));
  await importPhoneBackup(new File([await backup.blob.arrayBuffer()], backup.filename));
  const savedProfiles = vars.global[profiles.PROFILE_VARIABLE_KEY].data;
  assert(Object.values(savedProfiles).some(p => p.characterImage?.prefix === 'red hair'));
  assert.equal(vars.global[profiles.SCRIPT_VARIABLE_KEY].data.imageServices.profiles[0].id, 'image-api');
  store.setCharacterImage(CharacterImageSchema.parse({ enabled: true, profileId: 'image-api', prefix: 'red hair' }));
  let resolve;
  global.fetch = () =>
    new Promise(r => {
      resolve = r;
    });
  const pending = store.generateCharacterImage('rain', new AbortController().signal);
  await assert.rejects(store.generateCharacterImage('duplicate', new AbortController().signal), /正在生图/);
  const count = originalThread.messages.length;
  originalThread.clearRevision += 1;
  resolve(new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] })));
  await assert.rejects(pending, /清空/);
  assert.equal(originalThread.messages.length, count);
  let resolveSwitch;
  global.fetch = () =>
    new Promise(r => {
      resolveSwitch = r;
    });
  const switching = store.generateCharacterImage('switch', new AbortController().signal);
  store.context.chatKey = 'another-chat';
  resolveSwitch(new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] })));
  await assert.rejects(switching, /切换/);
  assert.equal(originalThread.messages.length, count);
  console.log('PASS image chat insertion, backup, duplicate lock, clear/switch isolation');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
