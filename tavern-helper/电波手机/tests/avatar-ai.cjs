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
global.toastr = { success: () => {} };
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

const Upload = require(base + '/components/shared/WaveImageUpload.vue').default;
const { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const { ImageProfileSchema } = require(base + '/services/image/schema.ts');
const generation = require(base + '/services/generation/generation.ts');
const images = require(base + '/services/image/generate.ts');
const wait = () => new Promise(resolve => setTimeout(resolve, 20));
const click = text => {
  const button = [...document.querySelectorAll('button')].find(
    b => b.textContent.replace(/\s+/g, '') === text.replace(/\s+/g, ''),
  );
  assert(button, text);
  button.click();
};
let request, saved, resolveImage, imageSignal;
global.stopGenerationById = async () => true;
global.generateRaw = async value => {
  request = value;
  return 'solo, portrait, silver hair, soft light';
};
phone.settings.api.enabled = true;
phone.settings.api.model = 'dummy';
phone.settings.api.provider = 'openai';
phone.settings.api.apiurl = 'https://example.invalid/v1';
phone.settings.imageServices.profiles = [
  ImageProfileSchema.parse({
    id: 'nai',
    name: 'NovelAI',
    apiKey: 'dummy',
    vibes: [{ id: 'old-face', image: 'data:image/png;base64,old' }],
  }),
  ImageProfileSchema.parse({ id: 'gpt', name: 'GPT Image', provider: 'openai', apiKey: 'dummy' }),
];
const app = vue
  .createApp(Upload, { modelValue: 'data:image/png;base64,old', onConfirm: value => (saved = value) })
  .use(pinia);
app.provide(phoneSurfaceKey, vue.ref(document.querySelector('.wave-device')));
app.mount('#app');
(async () => {
  document.querySelector('.wave-image-preview').click();
  await vue.nextTick();
  click('AI 生成 描述头像，支持 AI 润色提示词');
  await vue.nextTick();
  const input = document.querySelector('textarea');
  input.value = '银发人物，柔和光线';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vue.nextTick();
  click('AI 润色');
  await wait();
  assert(request.custom_api, 'polish uses secondary API');
  assert(request.ordered_prompts[0].content.includes('目标 NovelAI'));
  assert.equal(input.value, 'solo, portrait, silver hair, soft light');
  const originalImage = images.generateImage;
  images.generateImage = async (profile, character, prompt, signal) => {
    assert.equal(profile.width, 1024);
    assert.equal(profile.height, 1024);
    assert.deepEqual(profile.vibes, []);
    assert.equal(character.references.length, 0);
    assert.equal(prompt, input.value);
    imageSignal = signal;
    return new Promise(resolve => (resolveImage = resolve));
  };
  if (process.env.WAVE_QA_DIR) {
    input.textContent = input.value;
    const style = document.createElement('style');
    style.textContent =
      require('sass').compile(path.join(base, 'styles/base/style.scss'), { logger: require('sass').Logger.silent })
        .css +
      'body{margin:0;background:#eee;font:14px system-ui}#wave-phone-script-root{display:block;position:relative;inset:auto;width:390px;max-width:100%;--wave-blue:#5e80be;--wave-ink:#374558}.wave-image-preview{display:none}.wave-device{position:relative!important;inset:auto!important;transform:none!important;width:100%!important;height:auto!important;border:0!important;background:none!important;box-shadow:none!important}.wave-image-modal{position:relative!important;inset:auto!important;display:block!important;padding:0!important;background:none!important}.wave-upload-subpage{width:100%}';
    document.head.append(style);
    fs.mkdirSync(process.env.WAVE_QA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.WAVE_QA_DIR, 'avatar-ai.html'),
      '<!doctype html>' + document.documentElement.outerHTML,
    );
  }
  click('生成头像');
  await wait();
  assert.equal(saved, undefined);
  resolveImage('data:image/png;base64,new');
  await wait();
  assert.equal(document.querySelector('.wave-upload-preview img').getAttribute('src'), 'data:image/png;base64,new');
  assert.equal(saved, undefined, 'generation is only a draft until Save');
  click('保存角色头像');
  await vue.nextTick();
  assert.equal(saved.avatar, 'data:image/png;base64,new');
  assert.equal(saved.zoom, 1);
  saved = undefined;
  document.querySelector('.wave-image-preview').click();
  await vue.nextTick();
  click('AI 生成 描述头像，支持 AI 润色提示词');
  await vue.nextTick();
  phone.state.activeCharKey = 'npc:avatar-test';
  phone.state.identities['npc:avatar-test'] = require(base + '/schemas.ts').IdentitySchema.parse({
    charKey: 'npc:avatar-test',
    name: 'Avatar NPC',
    actorType: 'npc',
    npcProfile: 'short silver hair, amber eyes',
    source: 'local_contact',
    createdAt: '',
    updatedAt: '',
  });
  await vue.nextTick();
  click('AI 生成 描述头像，支持 AI 润色提示词');
  await vue.nextTick();
  const blank = document.querySelector('textarea');
  assert.equal(blank.value, '');
  await vue.nextTick();
  images.generateImage = async (_p, _c, _t, signal) => {
    assert(_t.includes('short silver hair, amber eyes'), 'empty prompt reads the current NPC description');
    imageSignal = signal;
    return new Promise(resolve => (resolveImage = resolve));
  };
  click('生成头像');
  await wait();
  document.querySelector('[aria-label="返回角色头像编辑"]').click();
  await vue.nextTick();
  assert(imageSignal.aborted);
  resolveImage('data:image/png;base64,late');
  await wait();
  assert.equal(document.querySelector('.wave-upload-preview img').getAttribute('src'), 'data:image/png;base64,old');
  assert.equal(saved, undefined);
  await generation.polishAvatarPrompt(phone.settings, '一只猫', 'openai', 'test-gpt');
  assert(request.ordered_prompts[0].content.includes('目标 GPT Image'));
  assert.equal(request.ordered_prompts[1].content, '一只猫');
  images.generateImage = originalImage;
  app.unmount();
  console.log('PASS avatar AI entry/polish providers/draft preview/save/cancel/late result isolation');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
