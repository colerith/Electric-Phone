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
  const cardKey = 'character-file:a.png',
    key = `single:${cardKey}`;
  const initial = schema.ChatStateSchema.parse({
    cardKey,
    chatKey: chat,
    activeCharKey: key,
    identities: {
      [key]: {
        charKey: key,
        stableId: cardKey,
        name: 'Alice',
        source: 'auto_single_card',
        actorType: 'main',
        createdAt: now,
        updatedAt: now,
      },
    },
    threads: {
      main: {
        id: 'main',
        charKey: key,
        updatedAt: now,
        messages: [message('keep', 'char', 'existing private message')],
      },
    },
    chatPreferences: { [key]: { translationEnabled: true } },
  });
  vars.chat = { [schema.CHAT_VARIABLE_KEY]: initial };
  floors = ['Alice', 'Bob'].map((name, i) => ({
    message_id: i + 1,
    role: 'assistant',
    message: serializeDelta({
      version: 1,
      char_id: i ? 'bob' : cardKey,
      char_name: name,
      messages: [{ sender: 'char', type: 'text', content: `${name} reply`, payload: {} }],
      app_updates: {},
    }),
  }));
  await store.synchronize();
  assert(store.isReady, store.syncError);
  assert.equal(store.state.identities[key].name, 'Alice');
  assert.equal(store.state.identities[key].actorType, 'main');
  assert.equal(Object.values(store.state.identities).filter(i => i.name === 'Alice').length, 1);
  assert(
    Object.values(store.state.threads)
      .find(t => t.charKey === key)
      .messages.some(m => m.id === 'keep'),
  );
  assert(Object.values(store.state.identities).some(i => i.name === 'Bob' && i.charKey !== key));
  await store.synchronize();
  assert.equal(store.state.identities[key].name, 'Alice');

  // Existing pending-migration save is repaired without changing IDs/history/settings.
  const damaged = schema.ChatStateSchema.parse(initial);
  damaged.identities[key].name = '待迁移 · Alice';
  damaged.identities[key].source = 'temporary';
  const unrelated = 'contact:unrelated';
  damaged.identities[unrelated] = schema.IdentitySchema.parse({ ...damaged.identities[key], charKey: unrelated });
  const defaults = CharacterDefaultsSchema.parse({}),
    roster = {},
    profiles = {};
  const runtime = { cardKey, chatKey: chat, cardName: 'Alice', avatar: '/a.png', isGroup: false };
  assert(repairSingleCardAliases(damaged, runtime, roster, profiles, defaults));
  assert.equal(damaged.identities[key].name, 'Alice');
  assert.equal(damaged.identities[key].source, 'auto_single_card');
  assert.equal(damaged.identities[unrelated].name, '待迁移 · Alice');
  assert.deepEqual(damaged.threads, initial.threads);
  assert.deepEqual(damaged.chatPreferences, initial.chatPreferences);
  assert(Object.keys(defaults.identityRecovery).length);
  assert.equal(repairSingleCardAliases(damaged, runtime, roster, profiles, defaults), false);
  delete damaged.identities[unrelated];
  vars.chat = { [schema.CHAT_VARIABLE_KEY]: damaged };
  await store.synchronize();
  assert.equal(store.state.identities[key].name, 'Alice');
  assert(
    Object.values(store.state.threads)
      .find(t => t.charKey === key)
      .messages.some(m => m.id === 'keep'),
  );

  const css = require('sass').compile(base + '/styles/apps/messenger.scss').css;
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(
    `<style>${css}</style><div id="wave-phone-script-root"><div class="wave-device"><div class="messenger-app"><div class="messenger-swipe-row contact-swipe-row revealed"><div class="messenger-row-actions"><button>删除</button></div><button class="messenger-row">Contact</button></div><div class="messenger-swipe-row"><div class="messenger-row-actions"><button>置顶</button><button>删除</button></div></div></div></div></div>`,
  );
  const style = el => dom.window.getComputedStyle(el);
  assert.equal(style(dom.window.document.querySelector('.contact-swipe-row .messenger-row-actions')).width, '64px');
  assert.equal(
    style(dom.window.document.querySelector('.contact-swipe-row .messenger-row')).transform,
    'translateX(-64px)',
  );
  assert.equal(
    style(dom.window.document.querySelector('.messenger-swipe-row:not(.contact-swipe-row) .messenger-row-actions'))
      .width,
    '128px',
  );
  dom.window.close();
  console.log(
    'PASS main identity survives multiple characters, old pending state recovers losslessly, contact deletion width matches reveal',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
