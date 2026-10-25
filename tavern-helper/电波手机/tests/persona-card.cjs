const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="wave-phone-script-root"><div class="wave-device"><div id="app"></div></div></div>', {
  url: 'http://localhost',
});
for (const key of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
])
  global[key] = dom.window[key];
const compile = code =>
  ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const { parse, compileScript } = require('vue/compiler-sfc');
require.extensions['.vue'] = (m, f) =>
  m._compile(
    compile(compileScript(parse(fs.readFileSync(f, 'utf8')).descriptor, { id: f, inlineTemplate: true }).content),
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
let chat = 'test',
  floors = [],
  vars = { script: {}, global: {}, chat: {} };
global.SillyTavern = {
  name1: 'User',
  characterId: '1',
  groupId: '',
  characters: [],
  getCurrentChatId: () => chat,
  getContext: () => ({ substituteParams: x => x }),
};
Object.assign(global, {
  getCharData: () => ({ name: 'Alice', avatar: 'a.png' }),
  getCharAvatarPath: () => '/a.png',
  getVariables: ({ type }) => vars[type],
  replaceVariables: (value, { type }) => (vars[type] = value),
  getChatMessages: id => (typeof id === 'number' ? floors.filter(f => f.message_id === id) : floors),
  getTavernRegexes: () => [],
  updateTavernRegexesWith: async fn => fn([]),
  stopGenerationById: async () => true,
  toastr: { info: () => {} },
});
window.SillyTavern = global.SillyTavern;
const handlers = new Map();
global.tavern_events = new Proxy({}, { get: (_, name) => name });
global.eventOn = (event, fn) => {
  const list = handlers.get(event) || new Set();
  list.add(fn);
  handlers.set(event, list);
  return { stop: () => list.delete(fn) };
};
const emit = (name, ...args) => {
  for (const fn of [...(handlers.get(name) || [])]) fn(...args);
};
const injections = [];
global.injectPrompts = rows => {
  injections.push(...rows);
  return { uninject: () => {} };
};
global.setChatMessages = async rows => {
  for (const row of rows) {
    Object.assign(
      floors.find(f => f.message_id === row.message_id),
      row,
    );
    emit('CHARACTER_MESSAGE_RENDERED', row.message_id);
  }
};
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const vue = require('vue'),
  { createPinia } = require('pinia');
const { APP_IDS, ScriptSettingsSchema } = require(base + '/schemas.ts');
const { appApiMode, appApiSettings } = require(base + '/services/generation/app-api.ts');
const { usePhoneStore } = require(base + '/stores/phone.ts');
const ApiSettings = require(base + '/components/settings/WaveGenerationRecords.vue').default;
let phone;
const appId = vue.ref('memo');
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    return () => vue.h(ApiSettings, { app: appId.value });
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async fn => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await wait(5);
  }
  throw Error('timed out');
};
(async () => {
  await phone.synchronize();
  const { encodePersonaPng, decodePersonaPng, PersonaCardSchema } = require(base + '/services/chat/persona-card.ts');
  phone.setContactDetails({ actorType: 'main', relationshipToUser: '朋友', npcProfile: '多行人设\n中文 😀' });
  phone.setChatPreferences({
    ...phone.chatPreferences,
    autoTranslate: true,
    sourceLanguage: '英语',
    timeMode: 'off',
    crossChatProbability: 75,
  });
  const original = phone.exportPersonaData();
  const png = new Uint8Array(fs.readFileSync(base + '/assets/app-icons/status.png'));
  original.identity.avatar = 'data:image/png;base64,' + Buffer.from(png).toString('base64');
  original.profile.avatar = original.identity.avatar;
  original.profile.characterImage = {
    enabled: true,
    prefix: '角色外貌',
    profileId: 'profile-test',
    references: [{ id: 'ref1', image: original.identity.avatar }],
  };
  const encoded = encodePersonaPng(png, original);
  const decoded = decodePersonaPng(encoded);
  assert.equal(decoded.identity.npcProfile, '多行人设\n中文 😀');
  assert.equal(decoded.profile.chatPreferences.crossChatProbability, 75);
  assert.deepEqual(decodePersonaPng(encodePersonaPng(encoded, decoded)), decoded);
  const broken = encoded.slice();
  broken[30] ^= 1;
  assert.throws(() => decodePersonaPng(broken), /校验/);
  assert.throws(() => decodePersonaPng(png), /没有/);
  assert.throws(() => decodePersonaPng(encoded.slice(0, 25)), /完整|结束/);
  const before = phone.identities.length;
  const key = await phone.importPersonaData(decoded);
  assert.equal(phone.identities.length, before + 1);
  assert(phone.state.identities[key].name.endsWith('（2）'));
  assert.equal(phone.state.chatPreferences[key].sourceLanguage, '英语');
  await phone.synchronize();
  phone.selectIdentity(key);
  const restored = phone.exportPersonaData();
  assert.equal(restored.identity.avatar, decoded.identity.avatar);
  assert.equal(restored.profile.characterImage.prefix, '角色外貌');
  assert.equal(restored.identity.npcProfile, decoded.identity.npcProfile);
  assert(!JSON.stringify(restored).includes('apiKey'));
  const count = phone.identities.length;
  await assert.rejects(
    phone.importPersonaData({
      ...decoded,
      identity: { ...decoded.identity, avatar: 'https://example.com/avatar.png' },
    }),
    /内嵌/,
  );
  assert.equal(phone.identities.length, count);
  const Messenger = require(base + '/components/chat/WaveMessenger.vue').default;
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const messenger = vue.createApp(Messenger, { userName: 'User', userAvatar: '' });
  messenger.use(app.config.globalProperties.$pinia);
  messenger.provide(require(base + '/services/core/ui-context.ts').phoneSurfaceKey, vue.ref(document.body));
  const vm = messenger.mount(mount);
  await vm.toggleMenu();
  await tick();
  const menu = [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('从PNG导入角色'));
  assert(menu);
  menu.click();
  await tick();
  assert(document.querySelector('[aria-label="选择 PNG 人设卡"]'));
  messenger.unmount();
  app.unmount();
  console.log('PASS PNG metadata, Unicode, CRC, rejection, duplicate-safe import and settings persistence');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
