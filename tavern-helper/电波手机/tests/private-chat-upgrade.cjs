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
  await store.synchronize();
  const thread = store.activeThread;
  thread.messages = [
    message('u1', 'user', 'Original question'),
    message('a1', 'char', 'Old reply'),
    message('a2', 'char', 'Old second bubble'),
    message('image', 'char', 'Hand generated image', { generatedImage: true }),
    message('u2', 'user', 'Queued later', { awaitingReply: true }),
  ];
  thread.draft = 'unsent draft';
  store.settings.sendMode = 'main_api';
  const before = JSON.stringify(thread.messages);
  let release, captured;
  generation.generatePhoneReply = input => {
    captured = input;
    return new Promise(resolve => (release = resolve));
  };
  const pending = store.regenerateLatestReply();
  assert.equal(captured.settings.sendMode, 'secondary_api');
  assert.equal(JSON.stringify(thread.messages), before, 'keep originals during generation');
  assert.deepEqual(
    captured.thread.messages.map(m => m.id),
    ['u1'],
  );
  assert(!captured.latestUserText.includes('Queued later'));
  await assert.rejects(store.regenerateLatestReply(), /正在生成/);
  release({
    generationId: captured.generationId,
    data: schema.PhoneChatResponseSchema.parse({
      thread_id: thread.id,
      messages: [{ sender: 'char', content: 'New reply' }],
      app_updates: { memo: 'Do not replay side effects' },
    }),
  });
  await pending;
  assert.deepEqual(
    thread.messages.map(m => m.content),
    ['Original question', 'New reply', 'Hand generated image', 'Queued later'],
  );
  assert.equal(thread.messages.at(-1).payload.awaitingReply, true);
  assert.equal(thread.draft, 'unsent draft');
  assert.equal(store.state.independentAppUpdates.length, 0);
  assert.equal(thread.generating, false);
  assert.deepEqual(thread.replacedMessageIds, ['a1', 'a2']);
  const saved = JSON.stringify(thread.messages);
  generation.generatePhoneReply = async () => {
    throw Error('mock failure');
  };
  await assert.rejects(store.regenerateLatestReply(), /mock failure/);
  assert.equal(JSON.stringify(thread.messages), saved);
  assert.equal(thread.generating, false);
  generation.generatePhoneReply = input => {
    captured = input;
    return new Promise(resolve => (release = resolve));
  };
  const cancelled = store.regenerateLatestReply();
  await store.stopActiveGeneration();
  release({
    generationId: captured.generationId,
    data: schema.PhoneChatResponseSchema.parse({ messages: [{ content: 'Must be discarded', sender: 'char' }] }),
  });
  await cancelled;
  assert.equal(JSON.stringify(thread.messages), saved);
  const edited = store.regenerateLatestReply();
  thread.messages[0].content = 'Edited while generating';
  release({
    generationId: captured.generationId,
    data: schema.PhoneChatResponseSchema.parse({ messages: [{ content: 'Stale', sender: 'char' }] }),
  });
  await assert.rejects(edited, /发生变化/);
  assert.equal(thread.messages[1].content, 'New reply');
  assert.throws(
    () => latestReplyRound(schema.ThreadSchema.parse({ id: 'empty', charKey: 'x', updatedAt: now })),
    /还没有/,
  );
  // Voice libraries survive Zod parsing, store persistence and backup schema parsing.
  store.setCharacterVoice(
    CharacterVoiceSchema.parse({
      provider: 'fish',
      voiceId: 'one',
      savedVoices: [
        { id: 'v1', provider: 'fish', voiceId: 'one', note: '轻声' },
        { id: 'v2', provider: 'minimax', voiceId: 'two', note: '日常' },
      ],
    }),
  );
  assert.equal(
    schema.ChatStateSchema.parse(store.state).characterVoices[store.state.activeCharKey].savedVoices.length,
    2,
  );
  const originalKey = store.state.activeCharKey;
  await store.synchronize();
  assert.equal(store.state.characterVoices[originalKey].savedVoices[1].note, '日常');
  assert.deepEqual(CharacterVoiceSchema.parse({ voiceId: 'legacy' }).savedVoices, []);
  // Regenerating a Tavern-backed reply must not resurrect its old bubbles during later sync.
  floors = [{message_id:7,role:'assistant',message:serializeDelta({version:1,char_id:originalKey,char_name:'Alice',messages:[{sender:'char',type:'text',content:'Floor reply',payload:{}}],app_updates:{}})}];
  await store.synchronize();
  const floorThread = store.activeThread;
  floorThread.messages = [message('floor-user','user','Floor question'), ...floorThread.messages.filter(m=>m.payload.waveFloor)];
  const floorIds = floorThread.messages.filter(m=>m.payload.waveFloor).map(m=>m.id);
  assert(floorIds.length);
  generation.generatePhoneReply = async input => {
    assert.equal(input.historyBeforeFloor,7);
    assert(!input.thread.messages.some(m=>m.content==='Floor reply'));
    assert.equal(input.appSnapshot.messages,'');
    return {generationId:input.generationId,data:schema.PhoneChatResponseSchema.parse({messages:[{sender:'char',content:'Replacement floor reply'}]})};
  };
  await store.regenerateLatestReply();
  await store.synchronize();
  assert(!store.activeThread.messages.some(m=>floorIds.includes(m.id)));
  assert(store.activeThread.messages.some(m=>m.content==='Replacement floor reply'));
  floors = [];
  // Filename migration can create two automatic singletons. Same-name manual contacts are independent.
  const old = 'single:character:1',
    fresh = 'single:character-file:a.png',
    cardKey = 'character-file:a.png';
  const identity = (charKey, source = 'auto_single_card') =>
    schema.IdentitySchema.parse({
      charKey,
      source,
      stableId: charKey.slice(7),
      name: 'Same name',
      actorType: 'main',
      createdAt: now,
      updatedAt: now,
    });
  const state = schema.ChatStateSchema.parse({
    cardKey,
    chatKey: 'migration',
    activeCharKey: fresh,
    identities: { [old]: identity(old), [fresh]: identity(fresh), manual: identity('manual', 'local_contact') },
    threads: {
      old: { id: 'old', charKey: old, updatedAt: now, messages: [message('old-msg', 'char', 'saved old')] },
      fresh: { id: 'fresh', charKey: fresh, updatedAt: now, messages: [message('new-msg', 'char', 'saved new')] },
    },
  });
  const roster = structuredClone(state.identities),
    defaults = CharacterDefaultsSchema.parse({}),
    profiles = {};
  assert(repairSingleCardAliases(state, { cardKey, chatKey: 'migration', isGroup: false }, roster, profiles, defaults));
  assert.deepEqual(Object.keys(state.identities).sort(), [old, 'manual'].sort());
  assert.equal(state.activeCharKey, old);
  assert.equal(state.threads.old.messages.length, 2);
  assert(defaults.identityRecovery['migration::' + fresh].state.identities[fresh]);
  assert(!roster[fresh]);
  assert(!repairSingleCardAliases(state, { cardKey, isGroup: false }, roster, profiles, defaults));
  // Repeat real store synchronization: the repaired alias must not return from the shared roster.
  chat = 'migration';
  const recovery = defaults.identityRecovery['migration::' + fresh];
  vars.chat = { [schema.CHAT_VARIABLE_KEY]: structuredClone(recovery.state) };
  const wrap = data => ({ identifier: schema.WAVE_PHONE_IDENTIFIER, version: 1, data });
  vars.global = {
    ...vars.global,
    [schema.CARD_ROSTER_VARIABLE_KEY]: wrap({ [cardKey]: structuredClone(recovery.roster) }),
  };
  await store.synchronize();
  assert(store.isReady, store.syncError);
  assert(!store.state.identities[fresh]);
  assert(store.state.identities[old]);
  await store.synchronize();
  assert(!store.state.identities[fresh]);
  assert.equal(Object.values(store.state.threads).find(t => t.charKey === old).messages.length, 2);
  console.log(
    'PASS private regeneration atomic success/failure/cancel/edit, queued messages, voice libraries, safe singleton repair',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
