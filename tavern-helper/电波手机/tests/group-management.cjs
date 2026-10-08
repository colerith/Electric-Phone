const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    f,
  );
const { applyGroupManagement } = require('../services/chat/group-management.ts');
const group = {
  source: 'local_group',
  name: '旧群名',
  groupOwnerKey: 'owner',
  groupObserver: true,
  memberKeys: ['owner', 'admin', 'member'],
  groupMembers: { owner: {}, admin: { admin: true }, member: {} },
};
const identities = { owner: { name: '群主' }, admin: { name: '管理' }, member: { name: '成员' } };
const row = (id, actor, type, targetKey, value) => ({
  id,
  sender: 'char',
  type: 'text',
  content: '操作',
  createdAt: '2028-01-20T12:00:00Z',
  payload: { actorKey: actor, groupAction: { type, targetKey, value } },
});
const thread = {
  id: 'group-thread',
  messages: [
    row('1', 'member', 'name', '', '违规名'),
    row('2', 'admin', 'muted', 'owner', true),
    row('3', 'owner', 'name', '', '新群名'),
    row('4', 'owner', 'nickname', 'member', '新昵称'),
    row('5', 'admin', 'title', 'member', '头衔'),
    row('6', 'admin', 'muted', 'member', true),
  ],
};
applyGroupManagement(group, thread, identities);
assert.equal(group.name, '新群名');
assert(thread.messages[0].withdrawn);
assert(thread.messages[1].withdrawn);
assert.equal(group.groupMembers.member.nickname, '新昵称');
assert.equal(group.groupMembers.member.title, '头衔');
assert.equal(group.groupMembers.member.muted, true);
assert.equal(thread.messages[2].sender, 'system');
thread.messages.push(row('7', 'owner', 'remove', 'member'));
applyGroupManagement(group, thread, identities);
assert(!group.memberKeys.includes('member'));
const original = thread.messages[2].content;
group.name = '后续群名';
thread.messages[2] = row('3', 'owner', 'name', '', '新群名');
applyGroupManagement(group, thread, identities);
assert.equal(group.name, '后续群名');
assert.equal(thread.messages[2].content, original);
console.log('PASS: group authority, owner protection, rename/nickname/title/mute/removal, replay idempotence');
