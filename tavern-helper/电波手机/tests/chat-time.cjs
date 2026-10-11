const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
const { readPhoneChatTime, CHAT_TIME_PATTERN, registerChatTime } = require('../services/core/chat-time.ts');
const { SystemClockSettingsSchema, resolveClock, parseCivilTime } = require('../services/core/system-clock.ts');
global.SillyTavern = { chat: [] };
const stamp = (tag, time) => `<wave_time_${tag}>${time}</wave_time_${tag}>`;
const early = '2028/1/20 21:55',
  late = '2028/1/20 22:30';
SillyTavern.chat = [
  { mes: stamp('end', early) },
  { mes: stamp('start', early) + '正文' + stamp('end', late) },
  { is_user: true, mes: stamp('end', '2099/1/1 00:00') },
];
assert.equal(readPhoneChatTime(), late);
assert.equal(readPhoneChatTime(true), early);
assert.equal(SillyTavern.chat[1].mes.replace(CHAT_TIME_PATTERN, ''), '正文');
SillyTavern.chat[1].mes = stamp('start', early) + stamp('end', '2028/2/30 00:00');
assert.equal(readPhoneChatTime(), early);
SillyTavern.chat = [];
assert.equal(readPhoneChatTime(), '');
const settings = SystemClockSettingsSchema.parse({ source: 'phone', storyInitialTime: early });
assert.equal(resolveClock(settings, Date.now(), ''), parseCivilTime(early));
const handlers = {};
global.tavern_events = Object.fromEntries(
  ['GENERATION_AFTER_COMMANDS', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED'].map(x => [x, x]),
);
global.eventOn = (event, handler) => {
  handlers[event] = handler;
  return {
    stop() {
      delete handlers[event];
    },
  };
};
let injected = '',
  released = 0;
global.injectPrompts = prompts => {
  injected = prompts[0].content;
  return {
    uninject() {
      released++;
    },
  };
};
const stop = registerChatTime(() => settings);
assert.ok(injected.includes('<wave_time>'));
injected = '';
released = 0;
handlers.GENERATION_AFTER_COMMANDS('normal', {}, true);
assert.equal(injected, '');
handlers.GENERATION_AFTER_COMMANDS('normal', {}, false);
assert.ok(injected.includes(early) && injected.includes('wave_time_end'));
handlers.CHAT_CHANGED();
assert.ok(released >= 1);
injected = '';
handlers.GENERATION_AFTER_COMMANDS(undefined, {}, false);
assert.ok(injected.includes('wave_time_end'), 'empty normal generation type still injects');
handlers.GENERATION_ENDED();
settings.source = 'timezone';
injected = '';
handlers.GENERATION_AFTER_COMMANDS('normal', {}, false);
assert.equal(injected, '');
stop();
assert.equal(Object.keys(handlers).length, 0);
console.log('PASS: timestamps, invalid dates, edits, isolation, seed, display hiding, injection gating and cleanup');

assert.equal(require('../services/core/chat-time.ts').timeFromText('<wave_time>2028/1/20 22:30</wave_time>'), late);
assert.equal('<wave_time>2028/1/20 22:30</wave_time>'.replace(CHAT_TIME_PATTERN, ''), '');

// Exclusion changes must immediately remove persistent prompts, including mid-generation.
const { ref } = require('vue');
const allowed = ref(false);
let active = false,
  calls = 0;
global.injectPrompts = () => {
  active = true;
  calls++;
  return {
    uninject() {
      active = false;
    },
  };
};
settings.source = 'phone';
const stopExcluded = registerChatTime(
  () => settings,
  () => allowed.value,
);
assert.equal(calls, 0, 'excluded card must not inject on registration');
for (const type of ['normal', 'continue', 'swipe', 'regenerate', undefined]) {
  handlers.GENERATION_AFTER_COMMANDS(type, {}, false);
  handlers.GENERATION_ENDED();
  handlers.GENERATION_STOPPED();
  handlers.CHAT_CHANGED();
}
assert.equal(calls, 0, 'all lifecycle events remain silent for excluded cards');
allowed.value = true;
assert.equal(active, true, 'unexcluded card restores timestamp behavior');
handlers.GENERATION_AFTER_COMMANDS('normal', {}, false);
allowed.value = false;
assert.equal(active, false, 'exclusion removes an already injected prompt synchronously');
const beforeExcluded = calls;
handlers.GENERATION_ENDED();
assert.equal(calls, beforeExcluded, 'generation completion cannot restore excluded prompt');
stopExcluded();
allowed.value = true;
assert.equal(calls, beforeExcluded, 'disposed watcher cannot inject');

// Check the shared exclusion gate runs before reading/building any follow context.
for (const [file, name] of [
  ['../services/generation/follow-generation.ts', 'registerFollowGeneration'],
  ['../services/space/moments-follow.ts', 'registerMomentsFollow'],
]) {
  const code = ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(id => (id === 'vue' ? require('vue') : {}), exports);
  const input = () => {
    throw Error('excluded card must not build prompt context');
  };
  for (const anonymous of name === 'registerMomentsFollow' ? [false, true] : [false]) {
    const dispose =
      name === 'registerMomentsFollow'
        ? exports[name](
            input,
            () => {},
            anonymous,
            () => false,
          )
        : exports[name](
            input,
            () => false,
            undefined,
            () => false,
          );
    for (const type of ['normal', 'continue', 'swipe', 'regenerate']) {
      handlers.GENERATION_AFTER_COMMANDS(type, {}, false);
    }
    dispose();
  }
}
assert.equal(calls, beforeExcluded);
console.log('PASS: excluded cards suppress timestamp, module, space and tree-hole injections');
