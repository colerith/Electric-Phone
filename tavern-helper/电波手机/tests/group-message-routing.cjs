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

const schema = require(base + '/schemas.ts');
const { CharacterVoiceSchema } = require(base + '/services/chat/speech.ts');
const generation = require(base + '/services/generation/generation.ts');
const { latestReplyRound } = require(base + '/services/chat/regeneration.ts');
const { repairSingleCardAliases } = require(base + '/services/core/identity-repair.ts');
const { CharacterDefaultsSchema } = require(base + '/services/core/character-defaults.ts');
const now = new Date().toISOString();
const message = (id, sender, content, payload = {}) =>
  schema.PhoneMessageSchema.parse({ id, sender, content, payload, createdAt: now });
(async () => {
  const cardKey = 'character-file:%E4%B8%83%E6%B5%B7%E5%BB%BA%E4%BA%BA.png',
    main = `single:${cardKey}`,
    group = 'group-1792901095869-rvpd7yp',
    npc = 'contact-nitta';
  global.getCharData = () => ({ name: '七海建人', avatar: '七海建人.png' });
  const person = (charKey, name, source, extra = {}) =>
    schema.IdentitySchema.parse({ charKey, stableId: charKey, name, source, createdAt: now, updatedAt: now, ...extra });
  const initial = schema.ChatStateSchema.parse({
    cardKey,
    chatKey: chat,
    activeCharKey: main,
    identities: {
      [main]: person(main, '待迁移 · 七海建人', 'temporary', { stableId: cardKey, actorType: 'main' }),
      [npc]: person(npc, '新田明', 'local_contact', { actorType: 'npc' }),
      [group]: person(group, '工作群', 'local_group', { memberKeys: [main, npc] }),
    },
  });
  vars.chat = { [schema.CHAT_VARIABLE_KEY]: initial };
  const raw = {
    version: 1,
    char_id: cardKey,
    char_name: '待迁移 · 七海建人',
    messages: [
      {
        id: 'msg_20181101_1815_1',
        char_id: group,
        author: '新田明',
        authorKey: 'npc:新田明',
        sender: 'char',
        type: 'text',
        content: '七海さん、蓮見先生！ただいま病室に到着しました！',
        time: '18:15',
        translation: '七海先生、莲见老师！我刚抵达病房！',
      },
      {
        id: 'msg_20181101_1816_2',
        char_id: group,
        author: '待迁移 · 七海建人',
        authorKey: main,
        sender: 'char',
        type: 'text',
        content: 'ご苦労様でした、新田くん。',
        time: '18:16',
        translation: '辛苦了，新田君。',
      },
    ],
  };
  floors = [
    { message_id: 30, role: 'assistant', message: `<wave_phone_delta>${JSON.stringify(raw)}</wave_phone_delta>` },
  ];
  await store.synchronize();
  assert(store.isReady, store.syncError);
  assert.equal(store.state.identities[main].name, '七海建人');
  const thread = () => Object.values(store.state.threads).find(t => t.charKey === group);
  assert.equal(thread().messages.length, 2);
  assert.deepEqual(
    thread().messages.map(m => m.payload.actorKey),
    [npc, main],
  );
  assert.deepEqual(
    thread().messages.map(m => m.payload.translation),
    raw.messages.map(m => m.translation),
  );
  assert.equal(Object.values(store.state.threads).find(t => t.charKey === main).messages.length, 0);
  await store.synchronize();
  assert.equal(thread().messages.length, 2, 'replay must not duplicate routed messages');
  const { resolveGroupActor } = require(base + '/services/chat/group-replies.ts');
  assert.throws(() =>
    resolveGroupActor(store.state.identities[group], store.state.identities, { actorKey: main, actorName: '新田明' }),
  );
  const missing = { ...raw, messages: [{ ...raw.messages[0], char_id: 'group-missing' }] };
  floors.push({
    message_id: 31,
    role: 'assistant',
    message: `<wave_phone_delta>${JSON.stringify(missing)}</wave_phone_delta>`,
  });
  await store.synchronize();
  assert.equal(thread().messages.length, 2);
  assert.equal(Object.values(store.state.threads).find(t => t.charKey === main).messages.length, 0);
  const { ModelMessageSchema } = schema;
  assert.equal(
    ModelMessageSchema.parse({ ...raw.messages[0], payload: { translation: 'canonical' } }).payload.translation,
    'canonical',
  );
  const { repairSingleCardAliases } = require(base + '/services/core/identity-repair.ts');
  const oldParsed = schema.ChatStateSchema.parse(initial);
  oldParsed.identities[main].source = 'parsed';
  repairSingleCardAliases(
    oldParsed,
    { cardKey, chatKey: chat, cardName: '七海建人', isGroup: false },
    {},
    {},
    CharacterDefaultsSchema.parse({}),
  );
  assert.equal(oldParsed.identities[main].name, '七海建人');
  assert.equal(oldParsed.identities[main].source, 'parsed');
  console.log(
    'PASS per-message group routing, NPC alias, bilingual payload, pending-name replay, missing-target guard and no duplicates',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
