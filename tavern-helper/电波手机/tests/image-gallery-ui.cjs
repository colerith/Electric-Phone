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

const { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const { ImageAssetSchema, imageTargetKey } = require(base + '/services/image/library.ts');
const { ImageProfileSchema } = require(base + '/services/image/schema.ts');
const { MomentPostSchema } = require(base + '/services/space/moments.ts');
const Viewer = require(base + '/components/shared/WaveImageViewer.vue').default;
const targets = [
  { kind: 'moment', postId: 'p', index: 0 },
  { kind: 'moment', postId: 'p', index: 1 },
];
phone.state.moments.posts = [
  MomentPostSchema.parse({
    id: 'p',
    authorKey: 'user',
    authorName: 'User',
    content: '旅行随记',
    createdAt: 0,
    availableAt: 0,
    images: [
      { kind: 'description', description: '傍晚的山谷' },
      { kind: 'description', description: '一杯热茶' },
    ],
  }),
];
phone.settings.imageServices.profiles = [ImageProfileSchema.parse({ id: 'nai', name: 'NovelAI', apiKey: 'mock' })];
const svg =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#8da6d2"/><stop offset="1" stop-color="#e7c6ab"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h800v500H0z"/><circle cx="570" cy="130" r="48" fill="#fff3d5"/><path d="M0 410L220 110l280 390H0" fill="#778daa"/><path d="M240 500L540 220l260 180v100" fill="#536b8d"/><path d="M0 480L300 330l210 170" fill="#3c536c"/></svg>',
  ).toString('base64');
phone.state.moments.imageEdits[imageTargetKey(targets[0])] = ImageAssetSchema.parse({
  prompt: 'no humans, mountain valley, sunset, soft light',
  description: '傍晚的山谷，静得只剩风声。',
  profileId: 'nai',
  subject: 'scene',
  versions: [
    { id: '1', url: svg, prompt: 'mountains', description: '初版山谷' },
    { id: '2', url: svg, prompt: 'sunset mountains', description: '傍晚的山谷，静得只剩风声。' },
  ],
  selected: '2',
});
const app = vue.createApp(Viewer, { targets }).use(pinia);
app.provide(phoneSurfaceKey, vue.ref(document.querySelector('.wave-device')));
app.mount('#app');
const click = text => {
  const button = [...document.querySelectorAll('button')].find(
    b => b.textContent.trim() === text || b.getAttribute('aria-label') === text,
  );
  assert(button, text);
  button.click();
};
(async () => {
  await vue.nextTick();
  assert(document.querySelector('[role="dialog"]'));
  assert(document.querySelector('.gallery-stage img'));
  click('放大查看');
  await vue.nextTick();
  assert(document.querySelector('.gallery-stage.zoomed'));
  const stage = document.querySelector('.gallery-stage');
  Object.defineProperty(stage, 'offsetWidth', { value: 200 });
  stage.getBoundingClientRect = () => ({ width: 400 });
  const pointer = (type, pointerType, x, y) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, pointerType, button: 0, clientX: x, clientY: y });
    stage.dispatchEvent(event);
  };
  for (const device of ['mouse', 'touch']) {
    stage.scrollLeft = 100;
    stage.scrollTop = 100;
    pointer('pointerdown', device, 100, 100);
    pointer('pointermove', device, 60, 40);
    assert.equal(stage.scrollLeft, 120, `${device} horizontal pan respects phone scale`);
    assert.equal(stage.scrollTop, 130, `${device} vertical pan respects phone scale`);
    pointer('pointercancel', device, 60, 40);
    pointer('pointermove', device, 0, 0);
    assert.equal(stage.scrollLeft, 120, 'cancel releases drag');
  }

  click('适应窗口');
  assert.equal(document.querySelector('textarea'), null, 'immersive view hides forms');
  assert.equal(document.querySelectorAll('.gallery-toolbar button i[class*=fa-]').length, 8);
  click('生成记录');
  await vue.nextTick();
  click('使用第 1 版');
  await vue.nextTick();
  assert.equal(phone.getImageAsset(targets[0]).selected, '1');
  click('生成记录');
  await vue.nextTick();
  click('使用第 2 版');
  await vue.nextTick();
  click('编辑配文');
  await vue.nextTick();
  const caption = document.querySelector('textarea');
  caption.value = '手动修改的配文';
  caption.dispatchEvent(new Event('input', { bubbles: true }));
  click('保存修改');
  await vue.nextTick();
  assert.equal(phone.getImageAsset(targets[0]).description, '手动修改的配文');
  click('下一张');
  await vue.nextTick();
  assert(document.body.textContent.includes('一杯热茶'));
  click('上一张');
  await vue.nextTick();
  if (process.env.WAVE_QA_DIR) {
    for (const el of document.querySelectorAll('textarea')) el.textContent = el.value;
    const style = document.createElement('style');
    style.textContent =
      'html,body{margin:0;background:#e9edf3;font:14px system-ui}#wave-phone-script-root{position:relative;width:390px;height:844px;--wave-blue:#5e80be;--wave-ink:#374558;--wave-card:#fff}.wave-device{position:relative;width:390px;height:844px}';
    document.head.append(style);
    fs.mkdirSync(process.env.WAVE_QA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.WAVE_QA_DIR, 'gallery.html'),
      '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file:///D:/SillyTavern/SillyTavern/public/css/fontawesome.min.css"><link rel="stylesheet" href="file:///D:/SillyTavern/SillyTavern/public/css/solid.min.css"><link rel="stylesheet" href="file:///D:/SillyTavern/SillyTavern/public/css/regular.min.css">' +
        document.documentElement.outerHTML,
    );
  }
  click('编辑提示词');
  await vue.nextTick();
  assert(document.querySelector('.gallery-sheet textarea'));
  if (process.env.WAVE_QA_DIR)
    fs.writeFileSync(
      path.join(process.env.WAVE_QA_DIR, 'gallery-prompt.html'),
      '<!doctype html><meta charset="utf-8">' + document.documentElement.outerHTML,
    );
  click('返回大图');
  await vue.nextTick();
  assert.equal(document.querySelector('.gallery-sheet'), null);
  click('删除此版');
  await vue.nextTick();
  assert.equal(phone.getImageAsset(targets[0]).versions.length, 2);
  click('确认删除');
  await vue.nextTick();
  assert.equal(phone.getImageAsset(targets[0]).versions.length, 1);
  app.unmount();
  console.log('PASS gallery Vue modal/zoom/image paging/version selection/caption editing/delete confirmation');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
