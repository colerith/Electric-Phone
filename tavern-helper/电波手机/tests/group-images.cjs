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
const { ImageProfileSchema, CharacterImageSchema } = require(base + '/services/image/schema.ts');
const images = require(base + '/services/image/generate.ts');
const gen = require(base + '/services/generation/generation.ts');
const prompts = require(base + '/prompts/index.ts');
(async () => {
  await store.synchronize();
  const alice = store.activeIdentity.charKey,
    bob = store.addContact('Bob', 'a friend');
  store.settings.imageServices.profiles = [ImageProfileSchema.parse({ id: 'gpt', provider: 'openai', apiKey: 'mock' })];
  store.setCharacterImage(
    CharacterImageSchema.parse({
      enabled: true,
      profileId: 'gpt',
      prefix: 'silver hair',
      references: [{ id: 'alice', image: 'data:image/png;base64,AQID' }],
    }),
  );
  store.selectIdentity(bob);
  store.setCharacterImage(
    CharacterImageSchema.parse({
      enabled: false,
      prefix: 'black hair',
      references: [{ id: 'bob', image: 'data:image/png;base64,BAUG' }],
    }),
  );
  const group = store.createGroup('朋友群', [alice, bob]);
  store.selectIdentity(group);
  store.setCharacterImage(
    CharacterImageSchema.parse({ enabled: true, profileId: 'gpt', generation: { min: 0, max: 2 } }),
  );
  store.updateGroupDetails({ voiceFollowPrivate: true });
  store.saveSettings();
  let calls = [],
    lastInput;
  images.generateImage = async (p, c, prompt) => {
    calls.push({ p, c, prompt });
    return 'data:image/png;base64,AQID';
  };
  gen.generatePhoneReply = async input => {
    lastInput = input;
    return {
      generationId: input.generationId,
      data: schema.PhoneChatResponseSchema.parse({
        thread_id: input.thread.id,
        messages: [
          {
            sender: 'char',
            type: 'image',
            content: 'Alice 的照片',
            payload: { actorKey: alice, imageRequest: { subject: 'character', prompt: 'reading' } },
          },
          {
            sender: 'char',
            type: 'image',
            content: 'Bob 的照片',
            payload: { actorKey: bob, imageRequest: { subject: 'character', prompt: 'standing' } },
          },
        ],
      }),
    };
  };
  await store.sendMessage('看看大家的照片', true);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].c.prefix, 'silver hair');
  assert.equal(calls[1].c.prefix, 'black hair');
  assert.equal(calls[1].c.references[0].id, 'bob');
  assert(calls.every(c => c.p.id === 'gpt'));
  assert.deepEqual(lastInput.media.image, { min: 0, max: 2 });
  assert(lastInput.media.voice.max > 0, 'group voice follow must remain enabled');
  const content = JSON.stringify(
    prompts.buildPhonePrompts({
      ...lastInput,
      voiceServices: store.settings.voiceServices,
      replyCount: store.settings.chat,
    }),
  );
  assert(content.includes('群聊生图'));
  assert(content.includes('silver hair'));
  assert(content.includes('black hair'));
  assert(content.includes('[GPT Image 生图规范]'));
  const message = store.activeThread.messages.filter(m => m.type === 'image').at(-1),
    target = { kind: 'message', threadId: store.activeThread.id, messageId: message.id, index: 0 };
  await store.runImageAction(target, store.getImageAsset(target), 'generate', new AbortController().signal);
  assert.equal(calls.at(-1).c.prefix, 'black hair', 'gallery regeneration resolves the original speaker');
  store.setCharacterImage(CharacterImageSchema.parse({ enabled: false, profileId: 'gpt' }));
  calls = [];
  await store.sendMessage('不开生图', true);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(calls.length, 0);
  assert.equal(lastInput.media.image.max, 0);
  console.log(
    'PASS group image settings/quota/provider/member appearance/reference isolation/gallery regeneration and voice compatibility',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
