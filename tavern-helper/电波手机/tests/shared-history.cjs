const fs = require('fs'), ts = require('typescript'), assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const { sharedChatHistory } = require('../services/chat/shared-history.ts');
const identities = {
  a: { charKey: 'a', name: 'Alice' }, b: { charKey: 'b', name: 'Bob' }, c: { charKey: 'c', name: 'Carol' },
  ab: { charKey: 'ab', name: 'AB群', source: 'local_group', memberKeys: ['a','b'] },
  ac: { charKey: 'ac', name: 'AC群', source: 'local_group', memberKeys: ['a','c'] },
};
const msg = (id, content, extra = {}) => ({ id, content, type: 'text', sender: 'user', status: 'sent', createdAt: id, payload: {}, ...extra });
const thread = (charKey, messages) => ({ id: charKey, charKey, messages });
const threads = {
  a: thread('a', [msg('03','a私聊')]), b: thread('b', [msg('04','b私聊')]), c: thread('c', [msg('05','c秘密')]),
  ab: thread('ab', [msg('01','ab旧消息'), msg('06','ab最新消息')]),
  ac: thread('ac', [msg('02','ac消息'), msg('07','已撤回',{withdrawn:true}), msg('08','失败',{status:'failed'}), msg('09','待回复',{payload:{awaitingReply:true}})]),
};
threads.ac.historyArchive = [msg('02','ac消息')];
const settings = { shareConversations: true, sharedHistoryCount: 20 };
const run = (key, s = settings) => sharedChatHistory(identities[key], threads[key], identities, threads, s);
const rows = output => JSON.parse(output.slice(output.indexOf('\n[') + 1));
let result = run('a');
assert(result.includes('ab最新消息') && result.includes('ac消息'));
assert(!result.includes('a私聊') && !result.includes('b私聊') && !result.includes('c秘密'));
assert(!result.includes('已撤回') && !result.includes('失败') && !result.includes('待回复'));
assert.equal(rows(result).filter(row => row.content.includes('ac消息')).length, 1);
assert.deepEqual(rows(run('a', {...settings, sharedHistoryCount: 1})).map(row => row.time), ['06']);
result = run('ab');
assert(result.includes('a私聊') && result.includes('b私聊') && result.includes('ac消息'));
assert(!result.includes('c秘密') && !result.includes('ab最新消息'));
assert.deepEqual(rows(result).find(row => row.content.includes('a私聊')).knownBy, ['a']);
assert.deepEqual(rows(result).find(row => row.content.includes('b私聊')).knownBy, ['b']);
assert.equal(run('a', {...settings, sharedHistoryCount: 0}), '');
assert.equal(run('a', {...settings, shareConversations: false}), '');
threads.ac.messages.push(msg('10','data:image/png;base64,'+'A'.repeat(10000)));
assert(!run('a').includes('AAAA'));
assert.equal(rows(run('ab', {...settings, sharedHistoryCount: 1})).length, 2);
console.log('shared chat history regression passed');
