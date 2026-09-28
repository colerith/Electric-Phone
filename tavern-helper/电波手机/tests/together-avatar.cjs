const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>');
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node']) global[key] = dom.window[key];
const vue = require('vue');
const { parse, compileScript } = require('vue/compiler-sfc');
const file = path.resolve('src/util/酒馆助手脚本/电波手机/components/chat/WaveTogether.vue');
const { descriptor } = parse(fs.readFileSync(file, 'utf8'));
const code = ts.transpileModule(compileScript(descriptor, { id: 'together', inlineTemplate: true }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const phone = vue.reactive({ activeIdentity: { avatar: 'char-old.png' }, currentPage: 'conversation' });
const music = vue.reactive({ current: { title: 'Song' }, playing: true, togetherSeconds: 60, view: '' });
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(
  id => {
    if (id.endsWith('/stores/phone')) return { usePhoneStore: () => phone };
    if (id.endsWith('/stores/music')) return { useMusicStore: () => music };
    return require(id);
  },
  mod,
  mod.exports,
);
const userAvatar = vue.ref('user-old.png');
const crop = vue.ref({ transform: 'scale(1)' });
const app = vue.createApp({
  setup: () => () => vue.h(mod.exports.default, { userAvatar: userAvatar.value, characterAvatarStyle: crop.value }),
});
app.mount('#app');
(async () => {
  userAvatar.value = 'user-new.png';
  phone.activeIdentity.avatar = 'char-new.png';
  crop.value = { transform: 'scale(1.5)' };
  await vue.nextTick();
  const images = document.querySelectorAll('.together-avatars img');
  assert.equal(images[0].getAttribute('src'), 'user-new.png');
  assert.equal(images[1].getAttribute('src'), 'char-new.png');
  assert.equal(images[1].style.transform, 'scale(1.5)');
  document.querySelector('button').click();
  assert.equal(phone.currentPage, 'music');
  assert.equal(music.view, 'player');
  app.unmount();
  console.log('PASS: together avatars and crop react to profile changes; music navigation is preserved.');
})().catch(error => {
  console.error(error);
  app.unmount();
  process.exitCode = 1;
});
