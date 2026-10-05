const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="wave-phone-script-root"><div class="wave-device"><div id="app"></div></div></div>', {
  url: 'http://localhost',
});
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent'])
  global[key] = dom.window[key];
const compile = code =>
  ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const { parse, compileScript, compileStyle } = require('vue/compiler-sfc');
require.extensions['.vue'] = (m, f) => {
  const { descriptor } = parse(fs.readFileSync(f, 'utf8'));
  m._compile(compile(compileScript(descriptor, { id: f, inlineTemplate: true }).content), f);
  const id = 'data-v-' + require('node:crypto').createHash('sha1').update(f).digest('hex').slice(0, 8);
  m.exports.default.__scopeId = id;
  for (const block of descriptor.styles) {
    const result = compileStyle({
      source: block.src ? fs.readFileSync(path.resolve(path.dirname(f), block.src), 'utf8') : block.content,
      filename: f,
      id,
      scoped: block.scoped,
      preprocessLang: block.lang,
    });
    assert.deepEqual(result.errors, []);
    assert.doesNotMatch(
      result.code,
      /#wave-phone-script-root\s*\{/,
      'component styles must never target the whole phone root',
    );
    const style = document.createElement('style');
    style.textContent = result.code;
    document.head.append(style);
  }
};
global._ = require('lodash');
global.z = require('zod').z;
const vars = { global: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => 'backup-ui', characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');

const pinia = createPinia();
require('pinia').setActivePinia(pinia);
const phone = require(base + '/stores/phone.ts').usePhoneStore();

const { NpcGenerationOptionsSchema, parseGeneratedNpcs } = require(base + '/services/chat/npc-generation.ts');
const { ImageProfileSchema } = require(base + '/services/image/schema.ts');
const { ChatPreferencesSchema } = require(base + '/services/chat/chat-preferences.ts');
const { translationLanguages } = require(base + '/services/generation/translation.ts');
const images = require(base + '/services/image/generate.ts');
const NpcGenerator = require(base + '/components/chat/WaveNpcGenerator.vue').default;
const schemas = require(base + '/schemas.ts');
const wait = () => new Promise(resolve => setTimeout(resolve, 20));
const click = text => {
  const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  assert(b, text);
  b.click();
};
let captured,
  resolveRequest,
  imageCalls = 0;
global.generateRaw = async request => {
  captured = request;
  return new Promise(resolve => (resolveRequest = resolve));
};
global.stopGenerationById = async () => true;
global.toastr = { success: () => {} };
(async () => {
  assert.equal(ChatPreferencesSchema.parse({}).sourceLanguage, translationLanguages[0].value);
  assert.equal(ChatPreferencesSchema.parse({ sourceLanguage: '英语' }).sourceLanguage, '英语');
  assert.throws(() => NpcGenerationOptionsSchema.parse({ count: 11 }));
  assert.throws(() => parseGeneratedNpcs({ npcs: [{ name: 'Alice', profile: 'test' }] }, 1, ['Alice']));
  phone.context = { cardKey: 'test-card', chatKey: 'test-chat', cardName: 'Alice', avatar: '', isGroup: false };
  phone.state.activeCharKey = 'alice';
  phone.state.identities.alice = schemas.IdentitySchema.parse({
    charKey: 'alice',
    name: 'Alice',
    source: 'local_contact',
    actorType: 'main',
    about: '主要人物资料',
    createdAt: '',
    updatedAt: '',
  });
  phone.settings.api.enabled = true;
  phone.settings.api.model = 'dummy';
  phone.settings.api.provider = 'openai';
  phone.settings.api.apiurl = 'https://example.invalid/v1';
  phone.settings.api.retryCount = 0;
  phone.settings.imageServices.profiles = [
    ImageProfileSchema.parse({
      id: 'test',
      provider: 'novelai',
      name: '测试头像接口',
      apiKey: 'dummy',
      vibes: [{ id: 'old-face', image: 'data:image/png;base64,old' }],
    }),
  ];
  document.querySelector('.wave-device').classList.add('wave-settings-surface');
  const app = vue.createApp(NpcGenerator).use(pinia);
  app.mount('#app');
  assert.equal(document.querySelector('input[type=range]').max, '10');
  const slider = document.querySelector('input[type=range]');
  slider.value = '2';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[aria-label="关联用户"]').click();
  click('Alice');
  document.querySelector('[aria-label="NPC 双语配置"]').click();
  await vue.nextTick();
  click('生成并添加 NPC');
  await wait();
  assert(document.body.textContent.includes('副 API 正在生成 2'));
  assert.equal(captured.custom_api.model, 'dummy');
  assert(captured.ordered_prompts.includes('persona_description'));
  assert(captured.ordered_prompts[0].content.includes('已选择关联真实用户 User'));
  assert.equal(document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), null);
  const progressBody = document.body.innerHTML;
  assert(captured.ordered_prompts[0].content.includes('主要人物资料'));
  assert(captured.ordered_prompts[0].content.includes('简体中文'));
  const row = name => ({
    name,
    profile: '完整人物性格及背景',
    relationship: '朋友',
    avatarPrompt: 'solo, portrait',
    avatar: 'https://untrusted.invalid/image',
  });
  resolveRequest(JSON.stringify({ npcs: [row('NPC One'), row('NPC Two')] }));
  await wait();
  const first = phone.identities.find(c => c.name === 'NPC One');
  assert(first);
  assert.equal(first.actorType, 'npc');
  assert(first.about.includes('关联人物：Alice'));
  assert(first.about.includes('关联用户：User'));
  assert(!phone.identities.some(c => c.name === 'User'));
  assert.equal(first.avatar, '');
  assert.equal(phone.state.chatPreferences[first.charKey].autoTranslate, true);
  assert.equal(vars.global[schemas.CARD_ROSTER_VARIABLE_KEY].data['test-card'][first.charKey].actorType, 'npc');
  assert.equal(
    vars.global[schemas.PROFILE_VARIABLE_KEY].data['test-card::' + first.charKey].chatPreferences.autoTranslate,
    true,
  );
  assert(document.body.textContent.includes('已添加 2 位 NPC'));
  const before = phone.identities.length;
  document.querySelector('[aria-label="关联用户"]').click();
  await vue.nextTick();
  click('再生成一批 NPC');
  await wait();
  assert(!captured.ordered_prompts.includes('persona_description'));
  click('取消生成');
  resolveRequest(JSON.stringify({ npcs: [row('Late One'), row('Late Two')] }));
  await wait();
  assert.equal(phone.identities.length, before);
  // Missing avatar config fails before making any model request.
  document.querySelector('[aria-label="生成 NPC 头像"]').click();
  await vue.nextTick();
  captured = undefined;
  click('生成并添加 NPC');
  await wait();
  assert.equal(captured, undefined);
  assert(document.body.textContent.includes('请先选择'));
  const selectors = [...document.querySelectorAll('.wave-select-trigger')];
  selectors[0].click();
  await vue.nextTick();
  click('测试头像接口');
  await vue.nextTick();
  images.generateImage = async (profile, character, prompt) => {
    imageCalls++;
    assert.equal(profile.vibes.length, 0);
    assert.equal(character.references.length, 0);
    assert.equal(prompt, 'solo, portrait');
    if (imageCalls === 2) throw Error('测试失败');
    return 'data:image/png;base64,AQID';
  };
  click('生成并添加 NPC');
  await wait();
  resolveRequest(JSON.stringify({ npcs: [row('Avatar One'), row('Avatar Two')] }));
  await wait();
  await wait();
  assert.equal(imageCalls, 2);
  assert.equal(phone.identities.find(c => c.name === 'Avatar One').avatar, 'data:image/png;base64,AQID');
  assert(phone.identities.some(c => c.name === 'Avatar Two'));
  assert(document.body.textContent.includes('头像生成失败，保留人物资料'));
  const count = phone.identities.length;
  click('再生成一批 NPC');
  await wait();
  phone.context = { ...phone.context, chatKey: 'another-chat' };
  await vue.nextTick();
  resolveRequest(JSON.stringify({ npcs: [row('Wrong One'), row('Wrong Two')] }));
  await wait();
  assert.equal(phone.identities.length, count);
  assert.throws(
    () =>
      phone.addGeneratedNpcs(
        [row('NPC One'), row('Unique')],
        NpcGenerationOptionsSchema.parse({ count: 2 }),
        phone.context,
      ),
    /同名/,
  );
  assert.equal(phone.identities.length, count, 'duplicate batch adds nothing');
  if (process.env.WAVE_QA_DIR) {
    const sass = require('sass');
    const style = document.createElement('style');
    style.textContent =
      sass.compile(path.join(base, 'styles/settings/settings.scss'), { logger: sass.Logger.silent }).css +
      sass.compile(path.join(base, 'styles/base/style.scss'), { logger: sass.Logger.silent }).css +
      'body{background:#eee;font:14px system-ui;margin:0}#wave-phone-script-root{display:block!important;position:relative!important;font:14px system-ui;--wave-blue:#5e80be;--wave-navy:#204075;--wave-accent:#b56580;inset:auto!important;width:390px!important;max-width:100%;box-sizing:border-box;margin:0!important;padding:20px;background:white;color:#263253}.wave-device{position:relative!important;inset:auto!important;transform:none!important;box-sizing:border-box;width:100%!important;height:auto!important;border:0!important;border-radius:0!important;background:white!important;box-shadow:none!important}';
    document.head.append(style);
    fs.mkdirSync(process.env.WAVE_QA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.WAVE_QA_DIR, 'npc-generator.html'),
      '<!doctype html>' + document.documentElement.outerHTML,
    );
  }
  if (process.env.WAVE_QA_DIR)
    fs.writeFileSync(
      path.join(process.env.WAVE_QA_DIR, 'npc-progress.html'),
      '<!doctype html><html>' + document.head.outerHTML + '<body>' + progressBody + '</body></html>',
    );
  app.unmount();
  console.log(
    'PASS NPC defaults/bounds/secondary API/relations/bilingual/batch integrity/cancel/switch/avatar failure',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
