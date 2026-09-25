const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file,
  );
global._ = require('lodash');
global.z = require('zod').z;
global.window = global;
global.SillyTavern = { name1: 'User' };
global.getVariables = () => ({});
global.replaceVariables = () => {};
const base = path.resolve(__dirname, '..');
const { resolveZoneAuthorKey, parseZonePage, mergeZoneSnapshot, ZoneCommentSchema } = require(
  base + '/services/space/zone.ts',
);
const actors = [
  { key: 'char:simon', names: ['Simon Riley', 'Simon', 'Cipher_Void'] },
  { key: 'char:soap', names: ['Soap'] },
  { key: 'user', names: ['User'] },
];
assert.equal(resolveZoneAuthorKey('Ghost', 'char:simon', 'char:simon', actors), 'char:simon');
assert.equal(resolveZoneAuthorKey('Ghost', 'owner', 'char:simon', actors), 'char:simon');
assert.equal(resolveZoneAuthorKey('Simon', undefined, 'char:simon', actors), 'char:simon');
assert.equal(resolveZoneAuthorKey(' @CIPHER_VOID ', undefined, 'char:simon', actors), 'char:simon');
assert.equal(
  resolveZoneAuthorKey('Ghost', undefined, 'char:simon', actors),
  '',
  'unknown aliases cannot be inferred from story dialogue',
);
assert.equal(
  resolveZoneAuthorKey('Simon', 'invented-id', 'char:simon', actors),
  '',
  'unknown explicit IDs cannot impersonate a contact',
);
assert.equal(
  resolveZoneAuthorKey('Simon', undefined, 'char:simon', [...actors, { key: 'other', names: ['Simon'] }]),
  '',
  'homonyms stay distinct',
);
assert.equal(
  resolveZoneAuthorKey('Simon', 'char:simon', 'char:simon', [...actors, { key: 'other', names: ['Simon'] }]),
  'char:simon',
);
const raw = JSON.stringify({
  profile: { username: 'Simon', handle: 'Cipher_Void' },
  posts: [
    {
      id: 'p',
      content: 'Morning',
      comments: [
        { id: 'c1', author: 'Soap', authorKey: 'char:soap', content: 'Morning' },
        {
          id: 'c2',
          author: 'Ghost',
          authorKey: 'char:simon',
          content: 'Shut up, Johnny.',
          parentId: 'c1',
          replyToAuthor: 'wrong name',
          replyToAuthorKey: 'char:simon',
        },
        { id: 'c3', author: 'Simon', content: 'Legacy nickname reply' },
        { id: 'c4', author: '@Cipher_Void', content: 'Legacy account reply' },
      ],
    },
  ],
});
const merged = mergeZoneSnapshot(raw, {
  posts: [
    { id: 'p', content: 'Morning', comments: [{ id: 'c2', author: 'Ghost', content: 'Edited', parentId: 'c1' }] },
  ],
});
assert.equal(
  parseZonePage(merged).posts[0].comments.find(c => c.id === 'c2').authorKey,
  'char:simon',
  'content-only edits keep the author key',
);
assert.equal(ZoneCommentSchema.parse({ id: 'old', author: 'Soap', content: 'Old' }).authorKey, undefined);
const { createPinia, setActivePinia } = require('pinia');
setActivePinia(createPinia());
const { usePhoneStore } = require(base + '/stores/phone.ts');
const { IdentitySchema, AppSnapshotSchema } = require(base + '/schemas.ts');
const store = usePhoneStore();
const makeIdentity = (charKey, name) => IdentitySchema.parse({ charKey, name, createdAt: '', updatedAt: '' });
store.state.identities = {
  'char:simon': makeIdentity('char:simon', 'Simon Riley'),
  'char:soap': makeIdentity('char:soap', 'Soap'),
};
store.state.snapshots['char:simon'] = AppSnapshotSchema.parse({ zone: raw });
const comments = store.momentsFeed.comments;
assert.equal(comments.find(c => c.content === 'Shut up, Johnny.').authorKey, 'char:simon');
assert.equal(
  comments.find(c => c.content === 'Shut up, Johnny.').replyToAuthorKey,
  'char:soap',
  'reply target comes from the parent comment, not the reply author',
);
assert.equal(comments.find(c => c.content === 'Shut up, Johnny.').replyToAuthorName, 'Soap');
assert.equal(comments.find(c => c.content === 'Legacy nickname reply').authorKey, 'char:simon');
assert.equal(comments.find(c => c.content === 'Legacy account reply').authorKey, 'char:simon');
assert.equal(Object.keys(store.state.moments.npcs).length, 0);
const { moduleGenerationRules, MOMENTS_RULES } = require(base + '/prompts/index.ts');
const prompt = moduleGenerationRules(
  { identity: store.state.identities['char:simon'], appSnapshot: store.state.snapshots['char:simon'] },
  ['zone'],
);
assert(prompt.includes('"authorKey":"char:simon"'));
assert(prompt.includes('"username":"Simon"'));
assert(prompt.includes('"handle":"Cipher_Void"'));
assert(prompt.includes('replyToAuthorKey'));
assert(prompt.includes('不得因为换了称呼'));
assert(MOMENTS_RULES.includes('贴主原 authorKey'));
console.log(
  'PASS: stable author IDs, legacy nickname/account matching, parent reply identity, homonym boundaries, incremental author preservation, and generation identity contract.',
);
