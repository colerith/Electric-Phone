const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' });
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
require.extensions['.vue'] = (m, f) => {
  const { descriptor } = parse(fs.readFileSync(f, 'utf8'));
  m._compile(compile(compileScript(descriptor, { id: f, inlineTemplate: true }).content), f);
};
global._ = require('lodash');
global.z = require('zod').z;
let vars = { script: {}, chat: {} };
let chatId = 'test';
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chatId, characterId: '1' },
  getCharData: () => ({ name: 'Alice', description: '角色卡描述：喜欢旅行。' }),
  getWorldbookNames: () => ['其他世界书', '角色设定'],
  getCharWorldbookNames: () => ({ primary: '角色设定', additional: [] }),
  getWorldbook: async () => [{ uid: 7, name: 'Dora', content: '世界书角色资料'.repeat(200) }],
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');

const { usePhoneStore } = require(base + '/stores/phone.ts');
const { identityAvatarStyle } = require(base + '/services/core/avatar.ts');
const { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const Upload = require(base + '/components/shared/WaveImageUpload.vue').default;
const Switch = require(base + '/components/shared/WaveCharacterSwitch.vue').default;
const Status = require(base + '/components/apps/WaveStatusPanel.vue').default;
const surface = vue.ref(null);
const fixture =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#eff4ff"/><rect width="200" height="800" fill="#689ae4"/><circle cx="200" cy="300" r="100" fill="#ffe090"/><path d="M0 400h400M200 0v800" stroke="#263750" stroke-width="8"/><rect x="100" y="450" width="200" height="200" fill="#ee8a99"/></svg>',
  );
let phone;
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h('div', { id: 'wave-phone-script-root' }, [
        vue.h('div', { class: 'wave-phone-host' }, [
          vue.h('div', { class: 'wave-overlay' }, [
            vue.h('section', { class: 'wave-device is-subpage page-status', ref: surface }, [
              vue.h('div', { class: 'wave-statusbar' }, '22:30'),
              vue.h('header', { class: 'wave-appbar' }, [
                vue.h('button', '‹'),
                vue.h('div', [vue.h('strong', '状态')]),
                vue.h('div', { class: 'appbar-tools' }, [vue.h('button', '✧'), vue.h('button', '☰'), vue.h(Switch)]),
              ]),
              vue.h('main', { class: 'wave-screen' }, [
                vue.h('section', { class: 'wave-app-content' }, [
                  vue.h(Status, {
                    raw: '',
                    name: phone.activeIdentity?.name || '',
                    avatar: fixture,
                    avatarStyle: identityAvatarStyle(phone.activeIdentity),
                  }),
                  vue.h(Upload, {
                    modelValue: fixture,
                    zoom: phone.activeIdentity?.avatarZoom,
                    offsetX: phone.activeIdentity?.avatarOffsetX,
                    offsetY: phone.activeIdentity?.avatarOffsetY,
                    onConfirm: value =>
                      phone.updateActiveIdentityProfile({
                        avatar: value.avatar,
                        avatarZoom: value.zoom,
                        avatarOffsetX: value.offsetX,
                        avatarOffsetY: value.offsetY,
                      }),
                  }),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]);
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
function snapshot(name) {
  if (!process.env.WAVE_AVATAR_QA) return;
  const sass = require('sass');
  const styles = [...fs.readFileSync(base + '/index.ts', 'utf8').matchAll(/import '(.+?\.scss)'/g)]
    .map(m => sass.compile(path.resolve(base, m[1]), { logger: sass.Logger.silent }).css)
    .join('\n');
  const componentStyle = parse(fs.readFileSync(base + '/components/shared/WaveCharacterSwitch.vue', 'utf8')).descriptor
    .styles[0].content;
  const cascade = new JSDOM(
    '<style>' +
      sass.compileString(componentStyle).css +
      styles +
      '</style>' +
      document.querySelector('#wave-phone-script-root').outerHTML,
    { virtualConsole: new (require('jsdom').VirtualConsole)() },
  );
  const get = selector => cascade.window.getComputedStyle(cascade.window.document.querySelector(selector));
  const trigger = get('.wave-character-switch > .wave-select-trigger');
  assert.equal(trigger.height, '38px');
  assert.equal(trigger.minHeight, '0px');
  assert.equal(trigger.padding, '0px');
  assert.equal(trigger.borderTopWidth, '0px');
  if (name === 'avatar-menu') {
    const menu = get('.wave-character-switch > .wave-select-menu');
    assert.equal(menu.left, 'auto');
    assert.equal(menu.right, '0px');
    assert.equal(get('.wave-character-switch [role=option]').display, 'flex');
  } else {
    for (const selector of ['.avatar-preview > img', '.wave-avatar-size-preview img']) {
      const image = get(selector);
      assert.equal(image.position, 'absolute');
      assert.equal(image.width, '100%');
      assert.equal(image.height, '100%');
      assert.equal(image.minHeight, '0px');
    }
  }
  cascade.window.close();

  fs.writeFileSync(
    path.join(process.env.WAVE_AVATAR_QA, name + '.html'),
    '<meta charset="utf-8"><style>' +
      sass.compileString(componentStyle).css +
      styles +
      'body{margin:0}#wave-phone-script-root{--wave-panel-width:328px;--wave-panel-height:690px;--wave-panel-scale:1}</style>' +
      document.querySelector('#wave-phone-script-root').outerHTML,
  );
}
(async () => {
  await phone.synchronize();
  phone.currentPage = 'status';
  phone.updateActiveIdentityProfile({ avatar: fixture, avatarZoom: 1.3, avatarOffsetX: 12, avatarOffsetY: 46 });
  const alice = phone.activeIdentity.charKey;
  const bob = phone.addContact('长名字主要角色用于检查文字完整显示', '朋友');
  phone.selectIdentity(bob);
  phone.setContactDetails({ actorType: 'main', relationshipToUser: '朋友', npcProfile: '' });
  phone.updateActiveIdentityProfile({ avatar: fixture });
  phone.selectPanelCharacter(alice);
  await tick();
  document.querySelector('.wave-character-switch .wave-select-trigger').click();
  await tick();
  snapshot('avatar-menu');
  document.querySelector('.wave-character-switch .wave-select-trigger').click();
  document.querySelector('.wave-image-preview').click();
  await tick();
  const images = [
    ...document.querySelectorAll('.avatar-preview > img,.wave-avatar-size-preview img,.status-avatar img'),
  ];
  assert.equal(images.length, 5);
  assert(images.every(img => img.style.transform === images[0].style.transform));
  snapshot('avatar-crop');
  document.querySelector('.primary-action').click();
  await tick();
  assert.equal(phone.activeIdentity.avatarZoom, 1.3);
  assert.equal(phone.activeIdentity.avatarOffsetY, 46);
  document.querySelector('.wave-image-preview').click();
  await tick();
  assert.equal(document.querySelector('.avatar-preview > img').style.transform, images[0].style.transform);
  app.unmount();
  console.log('PASS: matching editor, small-preview and status crops; saved crop survives reopening.');
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
