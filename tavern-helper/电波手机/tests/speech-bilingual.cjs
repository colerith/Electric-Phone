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
global.SillyTavern = { name1: 'User' };
global._ = require('lodash');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { displaySpeechText } = require(base + '/services/speech-tags.ts');
const { splitElectric } = require(base + '/services/electric.ts');
const { VoiceServicesSchema, CharacterVoiceSchema, speechRequest } = require(base + '/services/speech.ts');
const { ChatPreferencesSchema } = require(base + '/services/chat-preferences.ts');
const { ModuleSettingsSchema, resolveModuleSettings } = require(base + '/services/module-settings.ts');
const { voiceGenerationRules, chatBilingualRules, buildModulePrompt, buildPhonePrompts, buildMomentsPrompt } = require(
  base + '/prompts/index.ts',
);
const { IdentitySchema, ThreadSchema, AppSnapshotSchema } = require(base + '/schemas.ts');
const { limitModulePatch } = require(base + '/services/module-updates.ts');
const { formatPhoneMessage, formatMessagePreview } = require(base + '/services/message-format.ts');
const { MomentsStateSchema, MomentBatchSchema, MomentPlanSchema, momentTimeline } = require(
  base + '/services/moments.ts',
);
const raw = '(chuckle) 今天终于忙完了 <#0.5#> (breath) 好想见到你。';
assert.equal(displaySpeechText(raw), '今天终于忙完了   好想见到你。');
assert.equal(displaySpeechText('价格(含税) <普通文字> [待办]'), '价格(含税) <普通文字> [待办]');
assert.equal(displaySpeechText('[laughs] hello [short pause] there <break time="0.5s" />'), 'hello  there');
assert.deepEqual(splitElectric('<electric title="雨夜未寄出的讯号">思考内容</electric>正文'), {
  body: '正文',
  electric: '思考内容',
  electricTitle: '雨夜未寄出的讯号',
});
const services = VoiceServicesSchema.parse({
  minimax: { enabled: true, apiKey: 'test' },
  elevenlabs: { enabled: true, apiKey: 'test' },
});
const voice = CharacterVoiceSchema.parse({ provider: 'minimax', voiceId: 'test' });
assert.equal(JSON.parse(speechRequest(raw, services, voice).init.body).text, raw);
const chat = ChatPreferencesSchema.parse({ autoTranslate: true, sourceLanguage: '日语', targetLanguage: '英语' });
const local = ModuleSettingsSchema.parse({ memo: { maxNew: 1 } });
const effective = resolveModuleSettings(local, chat);
assert.equal(effective.memo.targetLanguage, '英语');
assert.equal(effective.memo.maxNew, 1);
assert.equal(local.memo.targetLanguage, '简体中文');
local.zone.syncChat = false;
assert.equal(resolveModuleSettings(local, chat).zone.targetLanguage, '简体中文');
const translated = { id: 'one', content: '原文', translation: { language: '英语', title: '', content: 'translation' } };
assert.equal(
  limitModulePatch('memo', '', { notes: [translated] }, effective).notes[0].translation.content,
  'translation',
);
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
  chatPreferences: chat,
  moduleSettings: local,
};
assert(voiceGenerationRules(input).includes('(lip-smacking)'));
assert(buildModulePrompt(input, ['messages'], true).includes('至少 1 条'));
assert(!buildModulePrompt(input, ['memo'], true).includes('MiniMax 专用'));
assert(buildModulePrompt(input, ['memo'], false).includes('英语'));
assert(buildModulePrompt(input, ['memo'], false).includes('title/content 必须保存位于上方'));
assert(buildPhonePrompts(input).some(p => p.content?.includes('payload.translation')));
const outgoing = formatPhoneMessage({
  sender: 'user',
  type: 'text',
  content: '嘟嘟嘟……',
  payload: { originalText: '嘟嘟嘟……', translation: 'Du du du...', outgoingLanguage: '英语' },
});
assert(outgoing.indexOf('Du du du...') < outgoing.indexOf('嘟嘟嘟……'));
assert(outgoing.includes('[User 消息·实际收到·英语]'));
assert(outgoing.includes('[User 原始输入·仅供语义参考]'));
const legacyOutgoing = formatPhoneMessage({
  sender: 'user',
  type: 'text',
  content: 'Du du du...',
  payload: { originalText: '嘟嘟嘟……', translation: '嘟嘟嘟……', outgoingLanguage: '英语' },
});
assert(legacyOutgoing.indexOf('Du du du...') < legacyOutgoing.indexOf('嘟嘟嘟……'));
const outgoingChat = ChatPreferencesSchema.parse({
  outgoingTranslation: true,
  inputLanguage: '简体中文',
  outgoingLanguage: '英语',
});
const outgoingRules = chatBilingualRules(outgoingChat);
assert(outgoingRules.includes('上方实际发送的译文、下方 User 原文'));
assert(outgoingRules.includes('实际收到'));
assert.equal(
  formatMessagePreview({
    sender: 'user',
    type: 'text',
    content: '嘟嘟嘟……',
    payload: { originalText: '嘟嘟嘟……', translation: 'Du du du...', outgoingLanguage: '英语' },
  }),
  '我：Du du du...',
);
assert.equal(
  formatMessagePreview({ sender: 'char', type: 'text', content: '稍等，我马上到。', payload: {} }),
  '稍等，我马上到。',
);
assert.equal(
  formatMessagePreview(
    { sender: 'char', type: 'voice', content: '你听得到吗？', payload: { transcript: '你听得到吗？' } },
    'Simon',
  ),
  'Simon：[语音] 你听得到吗？',
);
assert.equal(
  formatMessagePreview({ sender: 'user', type: 'image', content: '晚霞', payload: { description: '窗外的晚霞' } }),
  '我：[图片] 窗外的晚霞',
);
assert.equal(
  formatMessagePreview({ sender: 'system', type: 'system', content: '通话已结束', payload: {} }),
  '[系统] 通话已结束',
);
assert.equal(voiceGenerationRules({ ...input, voice: { ...voice, provider: 'off' } }), '');
assert(
  voiceGenerationRules({ ...input, voice: { ...voice, provider: 'elevenlabs' } }).includes('<break time="0.5s" />'),
);
services.elevenlabs.model = 'eleven_v3';
assert(voiceGenerationRules({ ...input, voice: { ...voice, provider: 'elevenlabs' } }).includes('[short pause]'));
const state = MomentsStateSchema.parse({});
const plan = MomentPlanSchema.parse({
  id: 'r',
  actors: [{ key: 'c', name: 'Char' }],
  postActor: 'c',
  comments: [],
  createdAt: 0,
  minDelay: 0,
  maxDelay: 0,
});
state.requests.r = plan;
assert(buildMomentsPrompt(plan, state, [], undefined, chat).includes('日语'));
assert(buildMomentsPrompt(plan, state, [], undefined, chat).includes('content 必须是位于上方'));
const batch = MomentBatchSchema.parse({
  request_id: 'r',
  posts: [{ authorKey: 'c', content: '原文', translation: translated.translation }],
});
state.events.push({ requestId: 'r', batch, receivedAt: 0 });
assert.equal(momentTimeline(state).posts[0].translation.content, 'translation');
console.log(
  'PASS: provider/model-bound prompts, display-only tag hiding, untouched TTS payload, scoped module activation, synchronized language validation and persisted Moments translations.',
);
