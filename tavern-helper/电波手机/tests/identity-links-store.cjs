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
  chat = 'identity-integration';
  const cardKey = 'character-file:a.png',
    old = 'contact-old',
    fresh = 'id:simon';
  const person = (charKey, name, source, extra = {}) =>
    schema.IdentitySchema.parse({ charKey, stableId: charKey, name, source, createdAt: now, updatedAt: now, ...extra });
  const initial = schema.ChatStateSchema.parse({
    cardKey,
    chatKey: chat,
    activeCharKey: fresh,
    identities: {
      [old]: person(old, 'Ghost', 'local_contact'),
      [fresh]: person(fresh, 'Simon', 'parsed', { stableId: 'simon', avatar: 'cat.png' }),
      group: person('group', '141', 'local_group', {
        memberKeys: [old],
        groupOwnerKey: old,
        groupMembers: { [old]: { nickname: 'Simon', admin: true, level: 4 } },
      }),
    },
    threads: {
      g: {
        id: 'g',
        charKey: 'group',
        updatedAt: now,
        messages: [message('group-reply', 'char', 'saved group reply', { actorKey: old })],
      },
    },
    restoredAppSnapshots: {
      [fresh]: {
        zone: JSON.stringify({
          profile: { username: 'S.Riley', handle: 'simon_riley_99' },
          posts: [
            {
              id: 'post',
              content: 'Dinner',
              comments: [{ id: 'reply', author: 'S.Riley', authorKey: 'simon', content: 'Still me' }],
            },
          ],
        }),
      },
    },
  });
  const wrap = data => ({ identifier: schema.WAVE_PHONE_IDENTIFIER, version: 1, data });
  vars.chat = { [schema.CHAT_VARIABLE_KEY]: initial };
  vars.global = { ...vars.global, [schema.CARD_ROSTER_VARIABLE_KEY]: wrap({ [cardKey]: initial.identities }) };
  floors = [
    {
      message_id: 1,
      role: 'assistant',
      message: serializeDelta({
        version: 1,
        char_id: 'simon',
        char_name: 'Simon',
        messages: [{ sender: 'char', type: 'text', content: 'Private reply', payload: {} }],
        app_updates: {},
      }),
    },
  ];
  await store.synchronize();
  assert(store.isReady, store.syncError);
  assert(!store.state.identities[old]);
  assert.deepEqual(store.state.identities.group.memberKeys, [fresh]);
  assert.equal(store.state.threads.g.messages[0].payload.actorKey, fresh);
  assert.equal(store.state.identities[fresh].avatar, 'cat.png');
  assert.equal(store.momentsFeed.comments.find(c => c.content === 'Still me').authorKey, fresh);
  await store.synchronize();
  assert(store.isReady, store.syncError);
  assert.deepEqual(store.state.identities.group.memberKeys, [fresh]);
  assert.equal(store.state.threads.g.messages.length, 1);
  assert.equal(Object.keys(store.state.identities).filter(k => k !== 'group').length, 1);
  // A later AI nickname and legacy ID reuse the same person.
  floors.push({
    message_id: 2,
    role: 'assistant',
    message: serializeDelta({
      version: 1,
      char_id: old,
      char_name: 'S.Riley',
      messages: [{ sender: 'char', type: 'text', content: 'Same person again', payload: {} }],
      app_updates: {},
    }),
  });
  await store.synchronize();
  assert(store.isReady, store.syncError);
  assert(!store.state.identities[old]);
  assert(store.state.identities[fresh]);
  assert.equal(store.state.identities.group.groupMembers[fresh].level, 4);
  assert.equal(Object.keys(store.state.identities).filter(k => k !== 'group').length, 1);
  floors.push({
    message_id: 3,
    role: 'assistant',
    message: serializeDelta({
      version: 1,
      char_id: 'group',
      char_name: '141',
      messages: [{ sender: 'char', type: 'text', content: 'Old group floor actor', payload: { actorKey: old } }],
      app_updates: {},
    }),
  });
  await store.synchronize();
  assert(store.isReady, store.syncError);
  const replay = Object.values(store.state.threads)
    .flatMap(thread => thread.messages)
    .find(message => message.content === 'Old group floor actor');
  assert(replay, 'legacy group floor reply must not be dropped during alias migration');
  assert.equal(replay.payload.actorKey, fresh);
  const replayId = replay.id;
  await store.synchronize();
  assert.equal(
    Object.values(store.state.threads)
      .flatMap(thread => thread.messages)
      .filter(message => message.id === replayId).length,
    1,
    'floor ID remains stable after normalization',
  );
  console.log('PASS store migration across synchronization, old AI IDs, social comments and preserved group identity');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
