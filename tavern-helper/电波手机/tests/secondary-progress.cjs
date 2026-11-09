const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const s = fs.readFileSync(require('node:path').join(__dirname, '../stores/phone.ts'), 'utf8');
const start = s.indexOf('  async function generateSecondaryFollow(');
const end = s.indexOf('\n  }', start) + 4;
const code = ts.transpileModule(s.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const run = new Function('d', 'job', `with(d){${code};return generateSecondaryFollow(job);}`);
async function scenario(mode) {
  let current = true,
    calls = 0;
  const order = [],
    logs = [],
    blocks = [];
  const actors = ['Alpha', 'Beta'].map(name => ({ identity: { name, charKey: name, stableId: name } }));
  const runtime = {
    input: { ...actors[0], cardKey: 'card', chatKey: 'chat' },
    settings: { moduleSettings: {} },
    followInputs: actors,
  };
  const state = { value: { threads: {}, moments: {}, secondaryResults: {}, generationReceipts: {} } };
  const d = {
    synchronize: async () => order.push('sync'),
    followModuleInput: () => runtime,
    moduleGenerating: { value: false },
    zoneGenerating: { value: false },
    state,
    appApiSettings: s => s,
    appApiMode: () => 'main_api',
    klona: structuredClone,
    momentsFeed: { value: { posts: [] } },
    treeHoleDay: () => '',
    holeActivity: () => ({}),
    momentTimeline: () => ({ posts: [] }),
    messageClockTime: () => 0,
    settings: { value: { basic: { systemClock: {} } } },
    createPhoneGenerationId: () => 'id',
    moduleGenerationId: '',
    followGenerationStatus: { value: '' },
    stopPhoneGeneration: async () => {},
    appApiGroup: () => 'one',
    generateFollowModules: async () => {
      calls++;
      order.push('request' + calls);
      if (calls === 2) {
        assert(order.includes('save'), 'first result must be saved before requesting second actor');
        if (mode === 'fail') throw Error('second failed');
        if (mode === 'cancel') current = false;
      }
      return { messages: [{ content: 'message' + calls }], app_updates: {} };
    },
    normalizeGroupReplies: (_, m) => m,
    serializeDelta: JSON.stringify,
    pendingModulePolicy: null,
    saveSecondaryResult: (_, floor, content) => blocks.push(content),
    saveChat: () => order.push('save'),
    flushPhoneStorage: async () => order.push('flush'),
    refreshGenerationRecords: () => {},
    logDiagnostic: (...x) => logs.push(x),
    readChatFloors: () => [{ message_id: 1, message: 'story' }],
    floorSource: s => s,
  };
  const job = {
    message: { message_id: 1, message: 'story' },
    modules: ['messages'],
    signal: new AbortController().signal,
    isCurrent: () => current,
  };
  if (mode === 'fail') await assert.rejects(run(d, job), /second failed/);
  else await run(d, job);
  assert.equal(
    blocks.length,
    mode === 'ok' ? 2 : 1,
    'completed blocks survive later failure/cancellation and are never duplicated',
  );
  assert(blocks[0].includes('message1'));
  assert(order.includes('flush'));
  if (mode === 'cancel') assert(logs.some(x => x[0] === '副 API 结果未写入'));
}
(async () => {
  for (const mode of ['ok', 'fail', 'cancel']) await scenario(mode);
  console.log('PASS progressive secondary persistence, late failure, cancellation and no duplicate writeback');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
