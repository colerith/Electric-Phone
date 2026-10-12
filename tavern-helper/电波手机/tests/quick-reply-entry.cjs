const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<form id="send_form"><div id="qr--bar"></div><div id="wave-phone-quick-reply"></div></form>');
Object.assign(global, { window: dom.window, document: dom.window.document });
let clicked = 0,
  creates = 0;
const commands = {};
const context = {
  eventSource: {
    emit: () => {
      clicked++;
    },
  },
  SlashCommand: { fromProps: value => value },
  SlashCommandParser: {
    commands,
    addCommandObject: command => {
      commands[command.name] = command;
    },
  },
};
window.SillyTavern = { getContext: () => context };
const sets = new Map();
const api = {
  settings: { isEnabled: true, config: { setList: [] } },
  getSetByName: name => sets.get(name),
  createSet: async (name, options) => {
    creates++;
    const set = { name, qrList: [], ...options };
    sets.set(name, set);
    return set;
  },
  createQuickReply: (name, label, props) => {
    const qr = { id: 1, label, ...props };
    sets.get(name).qrList.push(qr);
    return qr;
  },
  updateQuickReply: (name, id, props) =>
    Object.assign(
      sets.get(name).qrList.find(qr => qr.id === id),
      props,
    ),
  addGlobalSet: (name, isVisible) => api.settings.config.setList.push({ set: sets.get(name), isVisible }),
  executeQuickReply: async (name, label) => {
    const qr = sets.get(name).qrList.find(qr => qr.label === label);
    await commands[qr.message.slice(1)].callback();
  },
};
window.quickReplyApi = api;
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const result = {};
  new Function('exports', 'require', output)(result, name => mocks[name] || require(name));
  return result;
}
const bridge = load(path.resolve(__dirname, '../extension/bridge.ts'));
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  bridge.replaceScriptButtons([{ name: '电波手机', visible: true }]);
  bridge.replaceScriptButtons([{ name: '电波手机', visible: true }]);
  await tick();
  assert.equal(creates, 1);
  assert.equal(api.settings.config.setList.length, 1);
  const set = api.settings.config.setList[0].set;
  assert.equal(set.qrList.length, 1);
  assert.equal(set.qrList[0].message, '/wave-phone-open');
  assert.equal(set.disableSend, false);
  assert.equal(set.injectInput, false);
  assert.equal(document.querySelector('#wave-phone-quick-reply'), null, 'old imitation DOM is removed');
  await api.executeQuickReply(set.name, '📱电波手机');
  assert.equal(clicked, 1);
  const reference = process.env.QR_REFERENCE_PATH;
  if (reference) {
    const logger = { Logger: new Proxy({}, { get: () => () => {} }), LogCategory: {} };
    const upstream = load(path.join(reference, 'api.js'), { './constants.js': {}, './logger.js': logger });
    const listed = upstream.fetchQuickReplies().standard.filter(qr => qr.message === '/wave-phone-open');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].source, 'QuickReplyV2');
    await upstream.triggerQuickReply(listed[0].setName, listed[0].label);
    assert.equal(clicked, 2);
  }
  bridge.replaceScriptButtons([{ name: '电波手机', visible: false }]);
  await tick();
  assert.equal(set.qrList[0].isHidden, true);
  bridge.replaceScriptButtons([{ name: '电波手机', visible: true }]);
  await tick();
  assert.equal(set.qrList[0].isHidden, false);
  assert.equal(creates, 1);
  bridge.stopExtensionEvents();
  await tick();
  assert.equal(set.qrList[0].isHidden, true);
  assert.equal(commands['wave-phone-open'], undefined);
  bridge.replaceScriptButtons([{ name: '电波手机', visible: true }]);
  await tick();
  assert.equal(set.qrList.length, 1);
  assert.ok(commands['wave-phone-open']);
  bridge.stopExtensionEvents();
  await tick();
  dom.window.close();
  console.log(
    'PASS: native QR registration, idempotency, execution, visibility, cleanup' +
      (reference ? ' and actual uhhhh15/QR discovery/execution' : ''),
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
