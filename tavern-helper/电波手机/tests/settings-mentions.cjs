const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="forms"></div><div id="mentions"></div>', { url: 'http://localhost' });
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event'])
  global[name] = dom.window[name];
const compile = source =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
global.z = require('zod').z;
global._ = require('lodash');
const base = path.resolve(__dirname, '..');
const { ApiSettingsSchema } = require(base + '/schemas.ts');
const { MomentsStateSchema } = require(base + '/services/space/moments.ts');
assert.equal(ApiSettingsSchema.parse({}).contextLength, 2000000);
assert.equal(ApiSettingsSchema.parse({ contextLength: 100000 }).contextLength, 100000);
assert.equal(MomentsStateSchema.parse({}).settings.cooldownMinutes, 30);
assert.equal(MomentsStateSchema.parse({ settings: { cooldownMinutes: 10 } }).settings.cooldownMinutes, 10);
const { createApp, h, ref, nextTick } = require('vue');
const { provideSettingsForms, useSettingsForm } = require(base + '/services/core/settings-forms.ts');
const draft = ref({ text: 'saved' }),
  enabled = ref(true);
let registry,
  saves = 0,
  valid = true;
const Child = {
  setup() {
    useSettingsForm(
      () => draft.value,
      () => {
        if (!valid) return false;
        saves++;
      },
      () => enabled.value,
      value => {
        draft.value = value;
      },
    );
    return () => null;
  },
};
const app = createApp({
  setup() {
    registry = provideSettingsForms();
    return () => h(Child);
  },
});
app.mount('#forms');
const { parse, compileScript } = require('vue/compiler-sfc');
const file = base + '/components/shared/WaveMentionPicker.vue';
const sfc = compileScript(parse(fs.readFileSync(file, 'utf8')).descriptor, {
  id: 'mention-test',
  inlineTemplate: true,
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', compile(sfc.content))(require, mod, mod.exports);
const Picker = mod.exports.default;
const message = ref(''),
  contacts = [
    { charKey: 'alice', name: 'Alice', remark: '小爱' },
    { charKey: 'bob', name: 'Bob', remark: '' },
  ];
let selected,
  sends = 0;
const mentionApp = createApp({
  setup() {
    return () =>
      h(
        Picker,
        {
          contacts,
          onSelect: value => {
            selected = value.charKey;
          },
        },
        {
          default: () =>
            h('textarea', {
              value: message.value,
              onInput: e => {
                message.value = e.target.value;
              },
              onKeydown: e => {
                if (e.key === 'Enter') sends++;
              },
            }),
        },
      );
  },
});
mentionApp.mount('#mentions');
async function type(value, cursor = value.length) {
  const input = document.querySelector('#mentions textarea');
  input.value = value;
  input.setSelectionRange(cursor, cursor);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  return input;
}
(async () => {
  assert.equal(registry.dirty.value, false);
  draft.value.text = 'edited';
  await nextTick();
  assert.equal(registry.dirty.value, true);
  valid = false;
  assert.equal(registry.save(), false);
  assert.equal(saves, 0);
  assert.equal(registry.dirty.value, true);
  valid = true;
  assert.equal(registry.save(), true);
  assert.equal(registry.dirty.value, false);
  draft.value.text = 'discard me';
  registry.discard();
  assert.equal(draft.value.text, 'edited');
  enabled.value = false;
  await nextTick();
  draft.value.text = 'hidden';
  assert.equal(registry.dirty.value, false);
  enabled.value = true;
  await nextTick();
  assert.equal(registry.dirty.value, false);
  let input = await type('你好@Al 后文', 5);
  assert.equal(document.querySelectorAll('#mentions [role="option"]').length, 1);
  document.querySelector('#mentions [role="option"]').click();
  await nextTick();
  assert.equal(message.value, '你好@Alice  后文');
  assert.equal(selected, 'alice');
  input = await type('@');
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await nextTick();
  assert.equal(message.value, '@Bob ');
  assert.equal(selected, 'bob');
  assert.equal(sends, 0);
  await type('plain text');
  assert.equal(document.querySelector('#mentions [role="listbox"]'), null);
  app.unmount();
  mentionApp.unmount();
  console.log(
    'PASS: new defaults preserve saved values; dirty/save/failed validation/discard scopes; Chinese @ trigger, cursor insertion, selected identity, keyboard selection without sending',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
