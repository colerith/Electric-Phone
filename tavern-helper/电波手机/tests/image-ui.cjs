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
const ImageServices = require(base + '/components/settings/WaveImageServices.vue').default;
const CharacterImage = require(base + '/components/chat/WaveCharacterImage.vue').default;
const schemas = require(base + '/schemas.ts');
const { CharacterImageSchema } = require(base + '/services/image/schema.ts');
const app = vue.createApp(ImageServices).use(pinia);
app.mount('#app');
const click = text => {
  const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  assert(b, text);
  b.click();
};
function snapshot(name) {
  if (!process.env.WAVE_QA_DIR) return;
  const sass = require('sass');
  const css =
    sass.compile(path.join(base, 'styles/settings/settings.scss'), { quietDeps: true, logger: sass.Logger.silent })
      .css +
    sass.compile(path.join(base, 'styles/base/style.scss'), {
      quietDeps: true,
      logger: sass.Logger.silent,
    }).css;
  fs.mkdirSync(process.env.WAVE_QA_DIR, { recursive: true });
  const extra =
    '<style>html,body{margin:0;background:#e9e9ed;font:14px system-ui}#wave-phone-script-root{position:relative!important;width:390px!important;margin:auto!important;inset:auto!important}.wave-device{position:relative!important;width:390px!important;height:auto!important;min-height:840px;background:#fff;padding:20px;color:#263253;--wave-blue:#5e80be}.settings-card{padding:18px!important} .wave-image-settings{width:100%}</style>';
  fs.writeFileSync(
    path.join(process.env.WAVE_QA_DIR, name + '.html'),
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
      css +
      '</style>' +
      document.head.innerHTML +
      extra +
      document.body.innerHTML,
  );
}
(async () => {
  click('＋ NovelAI');
  await vue.nextTick();
  assert.equal(phone.settings.imageServices.profiles.length, 1);
  assert(document.body.textContent.includes('nai-diffusion-5-curated'));
  const width = document.querySelector('input[min="256"]');
  width.value = '0';
  width.dispatchEvent(new Event('input', { bubbles: true }));
  width.dispatchEvent(new Event('change', { bubbles: true }));
  await vue.nextTick();
  assert.equal(phone.settings.imageServices.profiles[0].width, 1024, 'invalid drafts never corrupt stored settings');
  width.value = '832';
  width.dispatchEvent(new Event('input', { bubbles: true }));
  width.dispatchEvent(new Event('change', { bubbles: true }));
  await vue.nextTick();
  assert.equal(phone.settings.imageServices.profiles[0].width, 832);
  const bridge = require(base + '/services/image/baibai.ts');
  bridge.baibaiReferences = () => [{ id: 'style', name: '测试 Vibe' }];
  bridge.importBaibaiReference = async () =>
    require(base + '/services/image/schema.ts').ImageReferenceSchema.parse({
      id: 'style',
      name: '测试 Vibe',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      strength: 0.6,
    });
  click('读取柏宝绘');
  await vue.nextTick();
  click('添加所选');
  await new Promise(r => setImmediate(r));
  await vue.nextTick();
  assert.equal(phone.settings.imageServices.profiles[0].vibes.length, 1);
  assert.equal(phone.settings.imageServices.profiles[0].vibes[0].name, '测试 Vibe');
  const vibeToggle = document.querySelector('[aria-label="启用 测试 Vibe"]');
  assert(vibeToggle);
  vibeToggle.click();
  await vue.nextTick();
  assert.equal(phone.settings.imageServices.profiles[0].vibes[0].enabled, false);
  const extraction = document.querySelectorAll('.vibe-card .image-grid input')[1];
  extraction.value = '.35';
  extraction.dispatchEvent(new Event('change', { bubbles: true }));
  await vue.nextTick();
  assert.equal(phone.settings.imageServices.profiles[0].vibes[0].informationExtracted, 0.35);
  snapshot('image-settings');
  click('＋ GPT Image');
  await vue.nextTick();
  assert.equal(phone.settings.imageServices.profiles.length, 2);
  assert(document.body.textContent.includes('gpt-image-2.5-sunburst'));
  app.unmount();
  phone.context = { cardKey: 'test-card', chatKey: 'test-chat', cardName: 'Alice', avatar: '', isGroup: false };
  phone.state.activeCharKey = 'alice';
  phone.state.identities.alice = schemas.IdentitySchema.parse({
    charKey: 'alice',
    stableId: 'alice',
    name: 'Alice',
    source: 'local_contact',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const characterApp = vue.createApp(CharacterImage).use(pinia);
  phone.setCharacterImage(
    CharacterImageSchema.parse({
      enabled: true,
      profileId: phone.settings.imageServices.profiles[0].id,
      prefix: 'silver hair, green eyes',
    }),
  );
  characterApp.provide(
    require(base + '/services/core/ui-context.ts').phoneSurfaceKey,
    vue.ref(document.querySelector('.wave-device')),
  );
  characterApp.mount('#app');
  await vue.nextTick();
  assert(document.body.textContent.includes('Alice'));
  const appearance = document.querySelector('textarea');
  assert.equal(appearance.value, 'silver hair, green eyes');
  appearance.value = 'blue hair';
  appearance.dispatchEvent(new Event('change', { bubbles: true }));
  await vue.nextTick();
  assert.equal(phone.characterImage.prefix, 'blue hair');
  click('＋ 本地图片 / 地址');
  await vue.nextTick();
  assert(document.querySelector('.wave-upload-dialog'));
  document.querySelector('[aria-label="关闭图片编辑"]').click();
  await vue.nextTick();
  assert(!document.querySelector('.wave-upload-dialog'));
  snapshot('character-image');
  characterApp.unmount();
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        paths: { '/v1/tts': { post: { parameters: [{ name: 'model', schema: { enum: ['s2.1-pro'] } }] } } },
      }),
    );
  phone.settings.voiceServices.fish.enabled = true;
  const voiceApp = vue.createApp(require(base + '/components/settings/WaveVoiceServices.vue').default).use(pinia);
  voiceApp.mount('#app');
  await new Promise(r => setImmediate(r));
  await vue.nextTick();
  const modelButton = [...document.querySelectorAll('button')].find(b => b.textContent.includes('拉取官方模型列表'));
  assert(modelButton?.classList.contains('wave-service-action'));
  snapshot('voice-services');
  voiceApp.unmount();
  console.log(
    'PASS image settings UI: profiles, invalid draft isolation, character persistence, reference modal close',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
