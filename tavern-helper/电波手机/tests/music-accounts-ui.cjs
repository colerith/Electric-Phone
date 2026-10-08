const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'https://localhost' });
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent'])
  global[key] = dom.window[key];
const vue = require('vue'),
  { parse, compileScript } = require('vue/compiler-sfc');
const file = path.resolve('src/util/酒馆助手脚本/电波手机/components/music/WaveMusicAccounts.vue');
const { descriptor } = parse(fs.readFileSync(file, 'utf8'));
const code = ts.transpileModule(compileScript(descriptor, { id: 'accounts', inlineTemplate: true }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
let resolveQr,
  signal,
  polls = 0;
const phone = vue.reactive({
  settings: { musicAccountApis: { netease: 'https://ne.example', qq: 'https://qq.example', kugou: '' } },
  saveSettings() {},
});
const mock = {
  accountProviders: [
    { id: 'netease', name: '网易云' },
    { id: 'qq', name: 'QQ' },
    { id: 'kugou', name: '酷狗' },
  ],
  cachedMusicAccount: () => undefined,
  accountBase: value => value,
  createMusicQr: (_p, _base, _channel, s) => {
    signal = s;
    return new Promise(r => {
      resolveQr = r;
    });
  },
  checkMusicQr: () => {
    polls++;
    return 'waiting';
  },
};
const select = vue.defineComponent({
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      vue.h(
        'select',
        { value: props.modelValue, onChange: e => emit('update:modelValue', e.target.value) },
        props.options.map(o => vue.h('option', { value: o.value }, o.label)),
      );
  },
});
const moduleValue = { exports: {} };
new Function('require', 'module', 'exports', code)(
  id => {
    if (id.includes('WaveSelect')) return { default: select, __esModule: true };
    if (id.endsWith('stores/phone')) return { usePhoneStore: () => phone };
    if (id.endsWith('stores/music')) return { useMusicStore: () => ({}) };
    if (id.endsWith('music-accounts')) return mock;
    return require(id);
  },
  moduleValue,
  moduleValue.exports,
);
const app = vue.createApp(moduleValue.exports.default, { configure: true });
app.mount('#app');
const tick = async () => {
  await new Promise(r => setImmediate(r));
  await vue.nextTick();
};
const click = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label).click();
(async () => {
  click('扫码登录');
  await tick();
  assert.ok(!signal.aborted);
  const field = document.querySelector('select');
  field.value = 'qq';
  field.dispatchEvent(new Event('change'));
  await tick();
  assert.ok(signal.aborted, 'provider switch cancels the previous login');
  resolveQr({ key: 'old', image: 'data:image/png;base64,AAAA' });
  await tick();
  assert.equal(document.querySelector('.music-account-qr'), null);
  assert.equal(polls, 0);
  click('扫码登录');
  await tick();
  app.unmount();
  assert.ok(signal.aborted, 'unmount cancels QR request');
  resolveQr({ key: 'late', image: 'data:image/png;base64,AAAA' });
  await tick();
  assert.equal(polls, 0);
  console.log('music accounts UI: platform switch and unmount cancel stale login work');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
