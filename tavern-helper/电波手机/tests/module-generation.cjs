const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file,
  );
global._ = require('lodash');
global.z = require('zod').z;
global.SillyTavern = { name1: 'User' };
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const schema = require(base + '/schemas.ts'),
  protocol = require(base + '/services/generation/module-protocol.ts'),
  parser = require(base + '/services/generation/parser.ts'),
  follow = require(base + '/services/generation/follow-generation.ts');
(async () => {
  const settings = schema.ScriptSettingsSchema.parse({});
  assert.equal(schema.MessageTypeSchema.safeParse('call').success, false);
  assert.equal(
    schema.PhoneMessageSchema.parse({
      id: 'legacy-call',
      sender: 'char',
      type: 'call',
      content: '旧通话记录',
      createdAt: '',
    }).type,
    'system',
  );
  assert.equal(settings.generation.followEnabled, false);
  assert.equal(
    follow.chooseFollowModule({ ...settings.generation, followEnabled: true, probability: 0 }, () => 0),
    null,
  );
  assert.equal(
    follow.chooseFollowModule(
      { ...settings.generation, followEnabled: true, probability: 100, modules: ['memo'] },
      () => 0.5,
    ),
    'memo',
  );
  assert.equal(
    follow.chooseFollowModule(
      { ...settings.generation, followEnabled: true, probability: 100, modules: [] },
      () => 0.5,
    ),
    null,
  );
  const ranged = {
    ...settings.generation,
    followEnabled: true,
    probability: 100,
    requiredModules: ['messages'],
    modules: ['messages', 'memo', 'zone', 'calendar', 'browse'],
    randomMin: 2,
    randomMax: 4,
  };
  const selected = follow.chooseFollowModules(ranged, () => 0.99);
  assert.equal(selected.length, 5);
  assert.equal(new Set(selected).size, 5);
  assert.equal(follow.chooseFollowModules({ ...ranged, modules: ['memo'] }, () => 0.99).length, 2);
  assert.deepEqual(
    follow.chooseFollowModules({ ...ranged, probability: 0 }, () => 0),
    ['messages'],
  );
  assert.equal(
    schema.PhoneChatResponseSchema.safeParse({
      version: 1,
      thread_id: 'test',
      messages: Array.from({ length: 15 }, (_, i) => ({
        client_id: String(i),
        sender: 'char',
        type: 'text',
        content: 'ok',
      })),
      app_updates: {},
    }).success,
    true,
  );
  assert.equal(
    schema.PhoneChatResponseSchema.safeParse({
      version: 1,
      thread_id: 'test',
      messages: [
        {
          client_id: 'packet-1',
          sender: 'char',
          type: 'red_packet',
          content: '大家一起沾沾喜气',
          payload: {
            amount: 88,
            currency: 'CNY',
            note: '好运来',
            packetType: 'group',
            state: 'group_available',
            count: 5,
            claimedCount: 0,
            actorKey: 'alice',
          },
        },
      ],
      app_updates: {},
    }).success,
    true,
  );
  const delta = protocol.ModuleDeltaSchema.parse({
    version: 1,
    char_id: 'alice',
    char_name: 'Alice',
    messages: [
      {
        sender: 'char',
        type: 'transfer',
        content: '<script>alert(1)</script>',
        payload: { amount: 20, state: 'pending' },
      },
    ],
    app_updates: { memo: '新备忘' },
  });
  const raw = protocol.serializeDelta(delta);
  assert.equal(protocol.readModuleDeltas(raw).length, 1);
  assert.equal(protocol.readModuleDeltas('<wave_phone_delta>{bad}</wave_phone_delta>').length, 0);
  assert.equal(
    protocol.readModuleDeltas(protocol.serializeDelta({ ...delta, app_updates: { wallet: 'invalid' } })).length,
    0,
  );
  const legacyCard = '<!--wave-phone-card:start--><aside>旧卡片</aside><!--wave-phone-card:end-->';
  assert.equal(protocol.stripInlineCards('正文\n' + raw + legacyCard).trim(), '正文\n' + raw);
  const blocks = parser.parsePhoneMessage(raw, 5);
  assert.equal(blocks.length, 1);
  let snapshot = schema.AppSnapshotSchema.parse({ memo: '已有备忘', calendar: '旧日程' });
  snapshot = parser.mergeAppSnapshot(snapshot, blocks[0]);
  assert.equal(snapshot.memo, '已有备忘\n新备忘');
  assert.equal(snapshot.calendar, '旧日程');
  assert.equal(parser.mergeAppSnapshot(snapshot, blocks[0]).memo, snapshot.memo);
  let rules = [{ id: 'other', enabled: true }],
    writes = 0;
  global.getTavernRegexes = () => rules;
  global.updateTavernRegexesWith = async fn => {
    writes++;
    rules = fn(rules);
    return rules;
  };
  await follow.installPhoneRegexes();
  await follow.installPhoneRegexes();
  assert.equal(writes, 1);
  assert.equal(rules.length, 4);
  const speechRule = rules.find(r => r.id === 'wave-phone-speech-display-v1');
  assert.deepEqual(speechRule.destination, { display: true, prompt: false });
  const speechRe = new RegExp(speechRule.find_regex.slice(1, -2), 'g');
  assert.equal('(laughs)你好<#0.5#>'.replace(speechRe, ''), '你好');
  assert.equal(rules[0].id, 'other');
  const remove = rules.find(r => r.destination?.prompt);
  const re = new RegExp(
    remove.find_regex.slice(1, remove.find_regex.lastIndexOf('/')),
    remove.find_regex.slice(remove.find_regex.lastIndexOf('/') + 1),
  );
  assert.equal(('正文\n' + raw + legacyCard).replace(re, '').trim(), '正文\n' + raw);
  assert(!rules.some(rule => rule.find_regex?.includes('electric')));
  const leaked = '<wave_phone_follow_context>\n内部协议\n</wave_phone_follow_context>\n真正正文';
  assert.equal(follow.stripLeakedFollowPrompt(leaked), '真正正文');
  const listeners = {};
  global.tavern_events = {
    GENERATION_AFTER_COMMANDS: 'before',
    GENERATION_ENDED: 'end',
    GENERATION_STOPPED: 'stop',
    CHAT_CHANGED: 'change',
  };
  global.eventOn = (name, fn) => {
    listeners[name] = fn;
    return { stop: () => delete listeners[name] };
  };
  let injected = 0,
    cleared = 0;
  global.injectPrompts = (prompts, options) => {
    injected++;
    assert.equal(prompts[0].depth, 1);
    assert.equal(options.once, true);
    assert(prompts[0].content.startsWith('<wave_phone_follow_context>'));
    assert(prompts[0].content.includes('<wave_phone_delta>'));
    return { uninject: () => cleared++ };
  };
  settings.generation = { ...settings.generation, followEnabled: true, probability: 100, modules: ['memo'] };
  const input = {
    cardName: 'Alice',
    identity: { stableId: 'alice', charKey: 'alice', name: 'Alice' },
    appSnapshot: snapshot,
  };
  const dispose = follow.registerFollowGeneration(
    () => ({ settings, input }),
    () => false,
  );
  listeners.before('normal', {}, true);
  listeners.before('quiet', {}, false);
  assert.equal(injected, 0);
  listeners.before('normal', {}, false);
  assert.equal(injected, 1);
  listeners.stop();
  assert.equal(cleared, 1);
  settings.basic.excludedCards = ['Alice'];
  listeners.before('normal', {}, false);
  assert.equal(injected, 1);
  dispose();
  assert.equal(Object.keys(listeners).length, 0);
  console.log(
    'PASS: settings defaults, probability boundaries, partial schema, bad payload rejection, legacy HTML cleanup, prompt filtering, incremental merge, global regex preservation/idempotency, dry-run/quiet exclusion, follow injection, stop cleanup, excluded card, dispose.',
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
