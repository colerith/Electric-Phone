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
const { updateGroupActivity, groupExperienceLabel } = require('../services/chat/group-activity.ts');
const group = { groupObserver: true, memberKeys: ['a', 'b'], groupMembers: { a: { level: 1 } } };
const msg = i => ({
  id: String(i),
  sender: 'char',
  type: 'text',
  content: 'hi',
  status: 'sent',
  payload: { actorKey: 'a' },
});
const thread = { id: 'thread', messages: Array.from({ length: 20 }, (_, i) => msg(i)) };
thread.messages.push(
  { ...msg('notice'), type: 'system' },
  { ...msg('failed'), status: 'failed' },
  { ...msg('withdrawn'), withdrawn: true },
  { ...msg('user'), sender: 'user' },
);
updateGroupActivity(group, thread);
assert.equal(group.groupMembers.a.messageCount, 20);
assert.equal(group.groupMembers.a.experience, 200);
assert.equal(group.groupMembers.a.level, 2);
assert.equal(group.groupMembers.user, undefined);
updateGroupActivity(group, thread);
assert.equal(group.groupMembers.a.experience, 200);
thread.messages = [];
updateGroupActivity(group, thread);
assert.equal(group.groupMembers.a.messageCount, 20);
thread.messages = [msg('new')];
updateGroupActivity(group, thread);
assert.equal(group.groupMembers.a.experience, 210);
const restored = JSON.parse(JSON.stringify(group));
updateGroupActivity(restored, thread);
assert.equal(restored.groupMembers.a.experience, 210);
thread.messages = Array.from({ length: 2000 }, (_, i) => msg('bulk' + i));
updateGroupActivity(group, thread);
assert.equal(group.groupMembers.a.level, 99);
assert(groupExperienceLabel(group.groupMembers.a).includes('已满级'));
const legacy = { memberKeys: ['a'], groupMembers: { a: { level: 5 } } };
updateGroupActivity(legacy, { id: 'old', messages: Array.from({ length: 80 }, (_, i) => msg(i)) });
assert.equal(legacy.groupMembers.a.experience, 800);
assert.equal(legacy.groupMembers.a.level, 5);
console.log(
  'PASS: group activity, experience, upgrade, no duplicate credit, clear/history persistence, observer exclusion, legacy levels and level 99 cap',
);
