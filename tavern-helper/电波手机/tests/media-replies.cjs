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
const { VoiceServicesSchema, CharacterVoiceSchema } = require(base + '/services/chat/speech.ts');
const { ImageServicesSchema, ImageProfileSchema, CharacterImageSchema } = require(base + '/services/image/schema.ts');
const media = require(base + '/services/chat/media-settings.ts');
const images = require(base + '/services/image/generate.ts');
const prompts = require(base + '/prompts/index.ts');
const gen = require(base + '/services/generation/generation.ts');
(async () => {
  await store.synchronize();
  const profile = ImageProfileSchema.parse({
    id: 'gpt',
    provider: 'openai',
    apiKey: 'dummy-test-only',
    prefix: 'portrait',
    vibes: [{ id: 'portrait-vibe', image: 'data:image/png;base64,AQID' }],
  });
  const character = CharacterImageSchema.parse({
    enabled: true,
    profileId: 'gpt',
    prefix: 'silver hair',
    references: [{ id: 'face', image: 'data:image/png;base64,AQID' }],
  });
  const services = VoiceServicesSchema.parse({ fish: { enabled: true }, generation: { min: 1, max: 4 } });
  const imageServices = ImageServicesSchema.parse({ profiles: [profile], generation: { min: 0, max: 2 } });
  const voice = CharacterVoiceSchema.parse({ provider: 'fish', voiceId: 'voice', generation: { min: 2, max: 3 } });
  let effective = media.resolveReplyMedia(services, imageServices, voice, character, 5);
  assert.deepEqual(effective.voice, { min: 2, max: 3 });
  assert.deepEqual(effective.image, { min: 0, max: 2 });
  assert.equal(
    media.resolveReplyMedia(services, imageServices, { ...voice, generation: null }, character, 5).voice.min,
    1,
  );
  assert.equal(
    media.resolveReplyMedia(services, imageServices, { ...voice, provider: 'off' }, character, 5).voice.max,
    0,
  );
  assert.equal(
    media.resolveReplyMedia(services, imageServices, voice, { ...character, enabled: false }, 5).image.max,
    0,
  );
  assert.equal(
    media.resolveReplyMedia(services, imageServices, voice, { ...character, generation: { min: 5, max: 5 } }, 3).image
      .min,
    1,
  );
  for (const subject of ['scene', 'object', 'other_character']) {
    const request = images.imageSubjectRequest(profile, character, { subject, prompt: 'a garden' });
    assert.equal(request.character.prefix, '');
    assert.deepEqual(request.character.references, []);
    assert.deepEqual(request.profile.vibes, []);
    assert.equal(request.profile.prefix, '');
    if (subject !== 'other_character') assert(request.prompt.includes('不含人物'));
  }
  assert.equal(
    images.imageSubjectRequest(profile, character, { subject: 'character', prompt: 'reading' }).character.prefix,
    'silver hair',
  );
  assert.equal(character.references.length, 1, 'original config remains intact');
  const input = {
    media: effective,
    replyCount: { minReplies: 3, maxReplies: 5 },
    voice,
    voiceServices: services,
    cardKey: store.context.cardKey,
    chatKey: store.context.chatKey,
    cardName: 'Alice',
    identity: store.activeIdentity,
    thread: store.activeThread,
    appSnapshot: schema.AppSnapshotSchema.parse({}),
    availableStickers: '',
  };
  let content = JSON.stringify(prompts.buildPhonePrompts(input));
  assert(content.includes('[GPT Image 生图规范]'));
  assert(!content.includes('[NovelAI 生图规范]'));
  assert(!content.includes('{{image_min}}'));
  assert(content.includes('2–3'));
  assert(content.includes('silver hair'));
  input.media = { ...effective, imageProvider: 'novelai' };
  content = JSON.stringify(prompts.buildPhonePrompts(input));
  assert(content.includes('[NovelAI 生图规范]'));
  assert(!content.includes('[GPT Image 生图规范]'));
  const entries = prompts.resolvePresetEntries({
    activeId: 'legacy',
    items: [{ id: 'legacy', name: 'old', entries: [] }],
    defaultToggles: {},
  });
  assert.equal(entries.filter(e => e.mediaProvider).length, 3);
  assert.throws(
    () =>
      media.validateReplyMedia([{ sender: 'char', type: 'voice', payload: {} }], {
        ...effective,
        voice: { min: 0, max: 0 },
      }),
    /语音/,
  );
  assert.throws(
    () =>
      media.validateReplyMedia(
        [{ sender: 'char', type: 'image', payload: { imageRequest: { subject: 'scene', prompt: 'landscape' } } }],
        { ...effective, voice: { min: 0, max: 0 }, image: { min: 0, max: 0 } },
      ),
    /生图/,
  );
  // Real store pipeline: use the selected provider, never feed a face into an object request, do not repeat on sync.
  store.settings.imageServices = imageServices;
  store.settings.voiceServices = VoiceServicesSchema.parse({});
  store.settings.imageServices.generation = { min: 0, max: 1 };
  store.setCharacterImage(character);
  store.saveSettings();
  let calls = 0,
    captured;
  images.generateImage = async (p, c, prompt) => {
    calls++;
    captured = { p, c, prompt };
    return 'data:image/png;base64,AQID';
  };
  gen.generatePhoneReply = async input => ({
    generationId: input.generationId,
    data: schema.PhoneChatResponseSchema.parse({
      thread_id: input.thread.id,
      messages: [
        {
          sender: 'char',
          type: 'image',
          content: '礼物',
          payload: { imageRequest: { subject: 'object', prompt: 'a wrapped present' } },
        },
      ],
    }),
  });
  await store.sendMessage('看看礼物', true);
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 1);
  assert.equal(captured.c.references.length, 0);
  assert.equal(captured.c.prefix, '');
  const reply = store.activeThread.messages.at(-1);
  assert.equal(reply.payload.url, 'data:image/png;base64,AQID');
  assert.equal(reply.payload.imageGenerationStatus, 'complete');
  await store.synchronize();
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 1);
  // Failure keeps both the text and image description; synchronization never retries a paid request.
  images.generateImage = async () => {
    calls++;
    throw Error('mock image failure');
  };
  await store.sendMessage('再来一张', true);
  await new Promise(r => setImmediate(r));
  assert.equal(store.activeThread.messages.at(-1).payload.imageGenerationStatus, 'failed');
  await store.synchronize();
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 2);
  images.generateImage = async () => {
    calls++;
    return 'data:image/png;base64,AQID';
  };
  floors = [
    {
      message_id: 9,
      role: 'assistant',
      message: serializeDelta({
        version: 1,
        char_id: store.activeIdentity.charKey,
        char_name: 'Alice',
        messages: [1, 2].map(i => ({
          client_id: 'floor-' + i,
          sender: 'char',
          type: 'image',
          content: 'scene ' + i,
          payload: { imageRequest: { subject: 'scene', prompt: 'a quiet garden ' + i } },
        })),
        app_updates: {},
      }),
    },
  ];
  await store.synchronize();
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 3, 'floor response is capped at one paid image');
  assert.equal(
    store.activeThread.messages.filter(
      m => m.payload.sourceMessageId === 9 && m.payload.imageGenerationStatus === 'skipped',
    ).length,
    1,
  );
  await store.synchronize();
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 3);
  let finish;
  images.generateImage = () => new Promise(resolve => (finish = resolve));
  await store.sendMessage('late image', true);
  const oldThread = store.activeThread,
    oldImage = oldThread.messages.at(-1);
  chat = 'switched-before-sync';
  finish('data:image/png;base64,STALE');
  await new Promise(r => setImmediate(r));
  assert(!oldImage.payload.url, 'late image must not write after Tavern chat changed');
  chat = 'test-chat';
  store.dispose();
  console.log(
    'PASS media bounds/overrides/provider presets/interpolation/subject separation/automatic images/no duplicate or failure retry',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
