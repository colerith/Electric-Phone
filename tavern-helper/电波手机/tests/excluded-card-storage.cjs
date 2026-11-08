const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const source = fs.readFileSync('tavern-helper/电波手机/stores/phone.ts', 'utf8');
const ast = ts.createSourceFile('phone.ts', source, ts.ScriptTarget.Latest, true);
let branch;
function visit(node) {
  if (
    !branch &&
    ts.isIfStatement(node) &&
    node.expression.getText(ast) === 'isCardExcluded(settings.value, runtime.cardName)'
  )
    branch = node.thenStatement.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(branch);
const run = new (Object.getPrototypeOf(async function () {}).constructor)('deps', `with(deps) ${branch}`);
(async () => {
  const runtime = { cardKey: 'card-a', chatKey: 'chat-a' };
  const saved = { identities: {}, threads: {}, activeCharKey: '', memo: 'keep existing contents' };
  const order = [];
  const deps = {
    runtime,
    token: 1,
    syncToken: 1,
    context: { value: null },
    state: { value: null },
    isReady: { value: false },
    syncError: { value: '' },
    characterProfiles: { value: {} },
    preparePhoneChat: async () => {
      order.push('restore');
    },
    getRuntimeContext: () => runtime,
    migratePhoneCardNamespace: () => false,
    readChatState: () => {
      order.push('read');
      return structuredClone(saved);
    },
    applyMomentUserProfile: () => {},
    hydrateCharacterDefaults: () => {},
    hydrateCardRoster: state => {
      state.identities.contact = { name: 'Saved contact' };
    },
    logDiagnostic: () => {},
  };
  await run(deps);
  assert.deepEqual(order, ['restore', 'read']);
  assert.equal(deps.state.value.identities.contact.name, 'Saved contact');
  assert.equal(deps.state.value.memo, 'keep existing contents');
  assert.equal(deps.state.value.activeCharKey, 'contact');
  assert.equal(deps.isReady.value, true);
  deps.state.value = 'other chat';
  deps.getRuntimeContext = () => ({ ...runtime, chatKey: 'chat-b' });
  await run(deps);
  assert.equal(deps.state.value, 'other chat');
  deps.getRuntimeContext = () => runtime;
  deps.preparePhoneChat = async () => {
    throw Error('offline');
  };
  await assert.rejects(run(deps), /offline/);
  assert.equal(deps.state.value, 'other chat');
  console.log(
    'PASS excluded cards retain contacts and contents; failed restore and chat switches never replace state.',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
