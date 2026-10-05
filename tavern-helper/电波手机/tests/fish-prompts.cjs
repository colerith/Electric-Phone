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
global.SillyTavern = { name1: 'User' };
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { VoiceServicesSchema, CharacterVoiceSchema, speechRequest } = require(base + '/services/chat/speech.ts');
const { ImageServicesSchema } = require(base + '/services/image/schema.ts');
const { resolveReplyMedia } = require(base + '/services/chat/media-settings.ts');
const { displaySpeechText } = require(base + '/services/chat/speech-tags.ts');
const { IdentitySchema, ThreadSchema, AppSnapshotSchema } = require(base + '/schemas.ts');
const { buildPhonePrompts, buildModulePrompt, resolvePresetEntries } = require(base + '/prompts/index.ts');
const { fishModelRules } = require(base + '/prompts/fish.ts');
const voice = CharacterVoiceSchema.parse({ provider: 'fish', voiceId: 'dummy' });
const services = VoiceServicesSchema.parse({ fish: { enabled: true, apiKey: 'dummy' }, minimax: { enabled: true } });
const input = {
  cardKey: 'c',
  chatKey: 'c',
  cardName: 'Char',
  identity: IdentitySchema.parse({ charKey: 'c', name: 'Char', createdAt: '', updatedAt: '' }),
  thread: ThreadSchema.parse({ id: 'c', charKey: 'c', updatedAt: '' }),
  appSnapshot: AppSnapshotSchema.parse({}),
  availableStickers: '',
  voice,
  voiceServices: services,
};
const refresh = () => (input.media = resolveReplyMedia(services, ImageServicesSchema.parse({}), voice, undefined));
for (const model of ['s2-pro', 's2.1-pro', 's2.1-pro-free']) {
  services.fish.model = model;
  refresh();
  const prompt = JSON.stringify(buildPhonePrompts(input));
  assert(prompt.includes('[Fish 语音表演规范]'));
  assert(prompt.includes('当前模型：' + model));
  assert(prompt.includes('用半角方括号'));
  assert(!prompt.includes('{{fish_'));
  assert(buildModulePrompt(input, ['messages'], true).includes('[Fish 语音表演规范]'));
  const text = '[温柔而克制]今天终于忙完了。[长停顿][语气坚定]现在想见你。';
  assert.equal(JSON.parse(speechRequest(text, services, voice).init.body).text, text);
  assert.equal(displaySpeechText(text, '今天终于忙完了。现在想见你。'), '今天终于忙完了。现在想见你。');
  assert.equal(displaySpeechText(text, '擅自改写'), text);
}
assert(fishModelRules('s1').includes('不使用 S2 自由描述方括号'));
assert(fishModelRules('drama-3-preview').includes('无标签自然口语'));
assert(fishModelRules('unknown').includes('尚未确认'));
assert.equal(displaySpeechText('[待办]明天见'), '[待办]明天见');
assert.equal(displaySpeechText('[囁き声で]誰にも聞かせないで。', '誰にも聞かせないで。'), '誰にも聞かせないで。');
voice.provider = 'minimax';
refresh();
assert(!JSON.stringify(buildPhonePrompts(input)).includes('[Fish 语音表演规范]'));
voice.provider = 'fish';
services.fish.enabled = false;
refresh();
assert(!JSON.stringify(buildPhonePrompts(input)).includes('[Fish 语音表演规范]'));
services.fish.enabled = true;
voice.generation = { min: 0, max: 0 };
refresh();
assert(!JSON.stringify(buildPhonePrompts(input)).includes('[Fish 语音表演规范]'));
const library = { activeId: 'old', defaultToggles: {}, items: [{ id: 'old', name: 'Old', entries: [] }] };
const entries = resolvePresetEntries(library);
const fish = entries.find(e => e.mediaProvider === 'fish');
assert(fish);
fish.content = 'My Fish {{fish_model}}';
library.items[0].entries = entries;
assert.equal(resolvePresetEntries(library).filter(e => e.mediaProvider === 'fish').length, 1);
assert.equal(resolvePresetEntries(library).find(e => e.mediaProvider === 'fish').content, fish.content);
input.identity = { ...input.identity, source: 'local_group', memberKeys: ['c'], groupVoiceFollowPrivate: true };
input.groupMembers = [{ charKey: 'c', name: 'Char' }];
input.groupVoices = { c: voice };
assert(JSON.stringify(buildPhonePrompts(input)).includes('[Fish 语音表演规范]'));
input.identity.groupVoiceFollowPrivate = false;
assert(!JSON.stringify(buildPhonePrompts(input)).includes('[Fish 语音表演规范]'));
console.log('PASS Fish preset selection/migration/model dialects/follow/group/raw TTS/clean transcript');
