const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
global._ = require('lodash');
global.z = require('zod').z;
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { ChatStateSchema, IdentitySchema, PhoneMessageSchema } = require(base + '/schemas.ts');
const { CharacterDefaultsSchema } = require(base + '/services/core/character-defaults.ts');
const { repairIdentityLinks } = require(base + '/services/core/identity-links.ts');
const { createParsedIdentity } = require(base + '/services/core/identity.ts');
const { resolveZoneAuthorKey } = require(base + '/services/space/zone.ts');
const { resolveGroupActor } = require(base + '/services/chat/group-replies.ts');
const { actorContext } = require(base + '/services/chat/chat-history.ts');
const runtime = { cardKey: 'card', chatKey: 'chat', cardName: '141', isGroup: false };
const identity = (key, name, source, extra = {}) =>
  IdentitySchema.parse({
    charKey: key,
    stableId: key,
    name,
    source,
    createdAt: '2027-09-25T10:00:00Z',
    updatedAt: '2027-09-25T10:00:00Z',
    ...extra,
  });
const old = 'contact-old',
  fresh = 'id:simon';
const state = ChatStateSchema.parse({
  cardKey: 'card',
  chatKey: 'chat',
  activeCharKey: old,
  identities: {
    [old]: identity(old, 'Ghost', 'local_contact'),
    [fresh]: identity(fresh, 'Simon', 'parsed', { stableId: 'simon', avatar: 'cat.png' }),
    group: identity('group', '141', 'local_group', {
      memberKeys: [old],
      groupOwnerKey: old,
      groupMembers: { [old]: { nickname: 'Simon', admin: true, level: 5 } },
    }),
  },
  threads: {
    oldThread: {
      id: 'oldThread',
      updatedAt: '2027-09-25',
      charKey: old,
      messages: [{ id: 'old-message', sender: 'char', content: 'old history', createdAt: '2027-09-25T10:00:00Z' }],
    },
    freshThread: {
      id: 'freshThread',
      updatedAt: '2027-09-25',
      charKey: fresh,
      messages: [{ id: 'new-message', sender: 'char', content: 'new history', createdAt: '2027-09-25T10:01:00Z' }],
    },
    groupThread: {
      id: 'groupThread',
      updatedAt: '2027-09-25',
      charKey: 'group',
      messages: [
        {
          id: 'group-message',
          sender: 'char',
          payload: { actorKey: old, claims: [{ actorKey: old, at: '2027-09-25', amount: 3 }] },
          createdAt: '2027-09-25T10:00:00Z',
        },
      ],
    },
  },
  snapshots: {
    [fresh]: { zone: JSON.stringify({ profile: { username: 'S.Riley', handle: 'simon_riley_99' }, posts: [] }) },
  },
  zoneInteractions: {
    [old]: { post: { comments: [{ id: 'reply', authorKey: old, author: 'Ghost', content: 'reply' }] } },
  },
});
const roster = structuredClone(state.identities),
  defaults = CharacterDefaultsSchema.parse({}),
  profiles = { 'card::contact-old': { remark: 'remark' } };
state.moments.settings.postingCharKeys = [old];
state.moments.requests.plan = {
  id: 'plan',
  actors: [{ key: old, name: 'Ghost' }],
  postActor: old,
  likes: [],
  comments: [],
};
assert(repairIdentityLinks(state, runtime, roster, profiles, defaults));
assert(!state.identities[old]);
assert.equal(state.moments.requests.plan.actors[0].key, fresh);
assert.equal(state.moments.requests.plan.postActor, fresh);
assert.deepEqual(state.moments.settings.postingCharKeys, [fresh]);
assert.equal(state.activeCharKey, fresh);
assert.deepEqual(state.identities.group.memberKeys, [fresh]);
assert.equal(state.identities.group.groupOwnerKey, fresh);
assert(state.identities.group.groupMembers[fresh].admin);
assert.equal(state.identities.group.groupMembers[fresh].level, 5);
assert.equal(state.threads.groupThread.messages[0].payload.actorKey, fresh);
assert.equal(state.threads.groupThread.messages[0].payload.claims[0].actorKey, fresh);
assert.equal(state.threads.freshThread.messages.length, 2);
assert(!state.threads.oldThread);
assert.equal(state.zoneInteractions[fresh].post.comments[0].authorKey, fresh);
assert(defaults.identityRecovery['chat::link::' + old]);
assert.equal(defaults.identityAliases[old], fresh);
assert.equal(resolveGroupActor(state.identities.group, state.identities, { actorKey: old }), fresh);
const parsed = createParsedIdentity(runtime, state, { stableId: old, name: 'S.Riley', messageId: 1, ordinal: 1 });
assert.equal(parsed.charKey, fresh);
assert.equal(parsed.stableId, 'simon');
assert.equal(parsed.avatar, 'cat.png');
const actors = [{ key: fresh, ids: ['simon', old], names: ['Simon', 'S.Riley', 'simon_riley_99'] }];
assert.equal(resolveZoneAuthorKey('S.Riley', 'simon', fresh, actors), fresh);
assert.equal(resolveZoneAuthorKey('S.Riley', old, fresh, actors), fresh);
assert.equal(resolveZoneAuthorKey('S.Riley', undefined, fresh, actors), fresh);
assert.equal(resolveZoneAuthorKey('someone', 'S.Riley', fresh, actors), fresh);
assert.equal(actorContext(parsed).actorId, fresh);
assert.equal(actorContext(parsed).char_id, 'simon');
assert(actorContext(parsed).legacyIds.includes(old));
// Repeated migration must not duplicate history or inflate unread counts.
repairIdentityLinks(state, runtime, roster, profiles, defaults);
const saved = JSON.stringify(state);
assert(!repairIdentityLinks(state, runtime, roster, profiles, defaults));
assert.equal(JSON.stringify(state), saved);
// Old floor replay can reintroduce references without recreating a contact.
state.threads.groupThread.messages[0].payload.actorKey = old;
assert(repairIdentityLinks(state, runtime, roster, profiles, defaults));
assert.equal(state.threads.groupThread.messages[0].payload.actorKey, fresh);
// Recover an orphaned group link using its unique saved nickname.
state.identities.group.memberKeys = ['lost'];
state.identities.group.groupMembers = { lost: { nickname: 'Simon', admin: true, level: 7 } };
assert(repairIdentityLinks(state, runtime, roster, profiles, defaults));
assert.deepEqual(state.identities.group.memberKeys, [fresh]);
// Ambiguous names never collapse independent contacts.
state.identities.other = identity('other', 'Simon', 'local_contact');
state.identities.group.memberKeys = ['ambiguous'];
state.identities.group.groupMembers = { ambiguous: { nickname: 'Simon' } };
repairIdentityLinks(state, runtime, roster, profiles, defaults);
assert.deepEqual(state.identities.group.memberKeys, ['ambiguous']);
console.log(
  'PASS identity merging, group references, social aliases, replay, idempotence, ambiguity and canonical AI context',
);
