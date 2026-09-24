const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' });
for (const key of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
])
  global[key] = dom.window[key];
const compile = code =>
  ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const { parse, compileScript } = require('vue/compiler-sfc');
require.extensions['.vue'] = (m, f) => {
  const { descriptor } = parse(fs.readFileSync(f, 'utf8'));
  m._compile(compile(compileScript(descriptor, { id: f, inlineTemplate: true }).content), f);
};
global._ = require('lodash');
global.z = require('zod').z;
let chat = 'test',
  vars = { script: {}, chat: {} };
Object.assign(global, {
  SillyTavern: { name1: 'User', getCurrentChatId: () => chat, characterId: '1' },
  getCharData: () => ({ name: 'Alice' }),
  getCharAvatarPath: () => '',
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');

const { usePhoneStore } = require(base + '/stores/phone.ts');
const { MomentsStateSchema, planMoments, syncMomentEvents, momentTimeline, momentContentSignature } = require(
  base + '/services/space/moments.ts',
);
const { npcAvatarUrl, npcAvatarSeed, spaceAvatarStyle, spaceAvatarUrl } = require(
  base + '/services/space/npc-avatar.ts',
);
const { buildMomentsPrompt } = require(base + '/prompts/index.ts');
const Messenger = require(base + '/components/chat/WaveMessenger.vue').default;
const Moments = require(base + '/components/space/WaveMoments.vue').default;
const Space = require(base + '/components/space/WaveSpace.vue').default;
const { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const screen = vue.ref('messenger');
let phone,
  messenger,
  floors = [];
global.getChatMessages = () => floors;
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    const surface = vue.ref(null);
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h('section', { ref: surface, class: 'wave-device' }, [
        vue.h(screen.value === 'zone' ? Space : screen.value === 'space' ? Moments : Messenger, {
          ref: v => (messenger = v),
          view: 'feed',
          context: 'space',
          userName: 'User',
          userAvatar: '',
          ...(screen.value === 'zone'
            ? { raw: '', artwork: '', name: 'Alice', avatar: '', busy: false, error: '' }
            : {}),
        }),
      ]);
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick(),
  click = (selector, text) => {
    const el = [...document.querySelectorAll(selector)].find(el => el.textContent.includes(text));
    assert(el, 'missing ' + text);
    el.click();
  };
const wrap = batch => '<wave_moments>' + JSON.stringify(batch) + '</wave_moments>';
(async () => {
  const signatureState = MomentsStateSchema.parse({});
  const emptySignature = momentContentSignature(signatureState);
  signatureState.likes.push('post-1');
  assert.equal(momentContentSignature(signatureState), emptySignature, 'likes must not create a Space unread update');
  signatureState.comments.push({
    id: 'comment-1',
    postId: 'post-1',
    authorKey: 'user',
    authorName: 'User',
    content: 'new content',
    createdAt: Date.now(),
    availableAt: Date.now(),
    parentId: '',
    replyToAuthorKey: '',
    replyToAuthorName: '',
  });
  assert.notEqual(momentContentSignature(signatureState), emptySignature, 'comments must count as authored content');
  assert.deepEqual(
    new Set(Array.from({ length: 32 }, (_, index) => spaceAvatarStyle(`pool-${index}`))),
    new Set(['notionists', 'bottts-neutral']),
  );
  await phone.synchronize();
  phone.state.moments.settings = {
    ...phone.state.moments.settings,
    followEnabled: true,
    npcEnabled: true,
    cooldownMinutes: 0,
    minDelaySeconds: 0,
    maxDelaySeconds: 0,
    postProbability: 100,
    commentProbability: 0,
    likeProbability: 0,
  };
  const now = Date.now() - 10000,
    plan = planMoments(phone.state.moments, phone.identities, [], now, () => 0),
    id = plan.postActor;
  assert(plan.actors.find(a => a.key === id).isNew);
  assert.equal(plan.actors.find(a => a.key === id).avatarSeed, npcAvatarSeed(id));
  const batch = {
    request_id: plan.id,
    npcs: [{ npcId: id, username: '小林', profile: '附近咖啡店的店员，喜欢摄影。', avatarSeed: npcAvatarSeed(id) }],
    posts: [{ authorKey: id, authorName: '小林', content: '今天的咖啡香气很好。', delaySeconds: 0 }],
    comments: [],
    likes: [],
  };
  phone.state.moments.requests[plan.id] = plan;
  phone.saveMoments();
  floors = [{ message_id: 0, role: 'assistant', message: wrap(batch) }];
  await phone.synchronize();
  await tick();
  assert.equal(phone.state.moments.npcs[id].username, '小林');
  assert(!phone.state.identities[id]);
  await phone.synchronize();
  assert.equal(Object.keys(phone.state.moments.npcs).length, 1);
  const reuse = planMoments(phone.state.moments, phone.identities, [], now + 1000, () => 0);
  assert.equal(reuse.postActor, id);
  assert.equal(reuse.actors.find(a => a.key === id).isNew, false);
  assert(buildMomentsPrompt(reuse, phone.state.moments, []).includes('knownNpcs'));
  assert(buildMomentsPrompt(reuse, phone.state.moments, []).includes('附近咖啡店'));
  screen.value = 'space';
  await tick();
  const author = document.querySelector('.moment-author');
  assert.equal(author.textContent, '小林');
  assert.match(
    document.querySelector('.moment-author-avatar img').src,
    /https:\/\/api\.dicebear\.com\/10\.x\/(?:notionists|bottts-neutral)\/svg/,
  );
  document.querySelector('.moment-meta button[aria-pressed]').click();
  await tick();
  assert(document.querySelector('.moment-likes .fa-regular.fa-heart'), 'like results use a hollow Font Awesome heart');
  document.querySelector('.moment-likes .moment-person-link').click();
  await tick();
  assert.equal(document.querySelector('.wave-person-name').textContent, 'User');
  assert.equal(document.querySelector('.wave-person-action'), null, 'self card cannot add yourself');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tick();
  assert.equal(document.querySelector('[role="dialog"]'), null);
  phone.state.moments.comments.push({
    id: 'legacy-guest-comment',
    postId: phone.momentsFeed.posts[0].id,
    authorKey: '',
    authorName: 'Soap_Mac',
    content: '老兄，你直接说主席能治你得了！',
    createdAt: now,
    availableAt: now,
    parentId: '',
    replyToAuthorKey: '',
    replyToAuthorName: '',
  });
  await tick();
  const commentAvatar = document.querySelector('.space-comment-avatar img');
  assert(commentAvatar);
  assert.equal(commentAvatar.src, spaceAvatarUrl('space-guest:Soap_Mac'));
  const guestName = document.querySelector('.space-comment-main header .moment-person-link');
  guestName.focus();
  guestName.click();
  await tick();
  assert.equal(document.querySelector('.wave-person-name').textContent, 'Soap_Mac');
  assert(document.querySelector('.npc-profile-about').textContent.includes('还没有留下介绍'));
  assert.equal(
    document.querySelector('.wave-person-action'),
    null,
    'legacy guests retain names without invented identities',
  );
  document.querySelector('.wave-person-overlay').click();
  await tick();
  assert.equal(document.activeElement, guestName, 'closing the modal restores the name button focus');
  const deleteComment = document.querySelector('.moment-comment-delete');
  assert(deleteComment, 'Space comments expose a delete action');
  deleteComment.click();
  await tick();
  assert(!document.body.textContent.includes('老兄，你直接说主席能治你得了！'));
  author.click();
  await tick();
  assert(!messenger.isSubpage, 'a profile modal does not replace the feed page');
  assert(document.querySelector('[role="dialog"][aria-modal="true"]'));
  assert.equal(
    document.querySelector('.wave-person-overlay').parentElement.className,
    'wave-device',
    'profiles teleport above the scrolling feed',
  );
  assert(document.querySelector('.moment-author'), 'the feed stays mounted under the modal');
  assert(document.querySelector('.npc-profile-about').textContent.includes('摄影'));
  const avatar = document.querySelector('.npc-profile-avatar img');
  avatar.dispatchEvent(new Event('error'));
  await tick();
  assert.equal(document.querySelector('.npc-profile-avatar img'), null);
  assert(document.querySelector('.npc-profile-avatar').textContent.includes('小'));
  click('.npc-profile-page button', '添加到通讯录');
  await tick();
  assert.equal(phone.state.identities[id].actorType, 'npc');
  assert.equal(phone.state.identities[id].npcProfile, batch.npcs[0].profile);
  assert.equal(phone.addMomentNpc(id), id);
  assert.equal(Object.values(phone.state.identities).filter(i => i.charKey === id).length, 1);
  assert.equal(messenger.back(), true);
  await tick();
  assert(!messenger.isSubpage);
  screen.value = 'messenger';
  await tick();
  click('.messenger-dock button', '联系人');
  await tick();
  assert([...document.querySelectorAll('.messenger-row')].some(el => el.textContent.includes('小林')));
  screen.value = 'space';
  await tick();
  document.querySelector('.moment-author').click();
  await tick();
  click('.npc-profile-page button', '发消息');
  await tick();
  assert.equal(phone.currentPage, 'conversation');
  assert.equal(phone.activeIdentity.charKey, id);
  phone.setContactDetails({ actorType: 'npc', npcProfile: '用户修改的人设：爱好绘画', relationshipToUser: '朋友' });
  assert.equal(phone.state.moments.npcs[id].profile, '用户修改的人设：爱好绘画');
  phone.setContactDetails({ npcProfile: '爱好绘画' + '人设'.repeat(1500) });
  phone.updateActiveIdentityProfile({ avatar: 'https://example.com/custom.png' });
  await phone.synchronize();
  assert.equal(phone.state.identities[id].avatar, 'https://example.com/custom.png');
  assert(phone.state.moments.npcs[id].profile.length > 2000);
  phone.updateActiveIdentityProfile({ resetAvatar: true });
  assert.equal(phone.state.identities[id].avatar, npcAvatarUrl(npcAvatarSeed(id)));
  phone.state.moments.settings.postingCharKeys = [id];
  const friendPlan = planMoments(phone.state.moments, phone.identities, [], now + 2000, () => 0);
  assert.equal(friendPlan.actors.filter(a => a.key === id).length, 1);
  assert(friendPlan.actors.find(a => a.key === id).about.includes('绘画'));
  // No arbitrary IDs, User impersonation, remote avatar seeds, or unrequested profile edits.
  const fresh = MomentsStateSchema.parse({ settings: { ...phone.state.moments.settings, postingCharKeys: [] } });
  const p = planMoments(fresh, [], [], now + 3000, () => 0);
  fresh.requests[p.id] = p;
  const newBatch = {
    ...batch,
    request_id: p.id,
    npcs: [{ ...batch.npcs[0], npcId: p.postActor, avatarSeed: npcAvatarSeed(p.postActor) }],
    posts: [{ ...batch.posts[0], authorKey: p.postActor }],
  };
  for (const bad of [
    { ...newBatch, npcs: [{ ...newBatch.npcs[0], npcId: 'user' }] },
    { ...newBatch, npcs: [{ ...newBatch.npcs[0], avatarSeed: 'https://bad.invalid' }] },
    { ...newBatch, posts: [{ ...newBatch.posts[0], authorKey: 'user' }] },
  ]) {
    syncMomentEvents(fresh, [wrap(bad)], now);
    assert.equal(fresh.events.length, 0);
    assert.equal(Object.keys(fresh.npcs).length, 0);
  }
  syncMomentEvents(fresh, [wrap(newBatch)], now);
  assert.equal(fresh.events.length, 1);
  // Homonyms are separate stable identities, never name-matched when adding friends.
  phone.state.moments.npcs[p.postActor] = fresh.npcs[p.postActor];
  const second = phone.addMomentNpc(p.postActor);
  assert.notEqual(second, id);
  assert.equal(phone.state.identities[second].name, phone.state.identities[id].name);
  // Old ambient IDs migrate without requiring a missing historical profile block.
  const legacy = MomentsStateSchema.parse({
    requests: { old: { ...p, id: 'old', actors: p.actors.map(({ isNew, ...a }) => a) } },
  });
  syncMomentEvents(legacy, [wrap({ ...newBatch, request_id: 'old', npcs: [] })], now);
  assert.equal(legacy.npcs[p.postActor].username, '小林');
  assert.equal(momentTimeline(legacy).posts[0].authorKey, p.postActor);
  // Contacts explicitly promoted to a main character belong to the card roster,
  // while their threads and generated content remain isolated per chat.
  phone.selectIdentity(id);
  phone.setContactDetails({ actorType: 'main', npcProfile: '常驻主角一', relationshipToUser: '朋友' });
  const firstPersistentMainKey = phone.activeIdentity.charKey;
  phone.selectIdentity(second);
  phone.setContactDetails({ actorType: 'main', npcProfile: '常驻主角二', relationshipToUser: '同伴' });
  const persistentMainKey = phone.activeIdentity.charKey;
  chat = 'fresh-chat';
  vars.chat = {};
  floors = [];
  await phone.synchronize();
  assert.equal(phone.state.mode, 'multi');
  assert.equal(phone.state.identities[firstPersistentMainKey].actorType, 'main');
  assert.equal(phone.state.identities[persistentMainKey].actorType, 'main');
  assert.equal(phone.state.identities[persistentMainKey].npcProfile, '常驻主角二');
  assert.equal(
    Object.values(phone.state.threads).find(thread => thread.charKey === persistentMainKey).messages.length,
    0,
  );
  screen.value = 'zone';
  await tick();
  document.querySelector('.zone-username').click();
  await tick();
  assert(document.querySelector('[role="dialog"]'), 'character Space names open a card');
  assert.equal(messenger.back(), true);
  await tick();
  const { treeHoleDay, TreeHolePostSchema } = require(base + '/services/space/tree-hole.ts');
  phone.state.treeHole[treeHoleDay()] = {
    topic: '测试话题',
    posts: [
      TreeHolePostSchema.parse({
        id: 'anon',
        alias: '远方来信',
        content: '今天很好',
        createdAt: Date.now(),
        comments: [{ id: 'reply', alias: '匿名听众', content: '收到', createdAt: Date.now() }],
      }),
    ],
  };
  click('.space-bottom button', '树洞');
  await tick();
  document.querySelector('.space-hole-post .space-post-author-details button').click();
  await tick();
  assert.equal(document.querySelector('.wave-person-name').textContent, '远方来信');
  assert(document.querySelector('.npc-profile-about').textContent.includes('匿名身份'));
  assert.equal(document.querySelector('.wave-person-action'), null, 'anonymous cards cannot expose a real contact');
  assert.equal(messenger.back(), true);
  await tick();
  document.querySelector('.space-hole-post .space-comment-main header button').click();
  await tick();
  assert.equal(document.querySelector('.wave-person-name').textContent, '匿名听众');
  document.querySelector('.wave-person-overlay').click();
  await tick();
  assert.equal(document.querySelector('[role="dialog"]'), null);
  app.unmount();
  console.log(
    'PASS: persistent NPC plans and replay, profile navigation, avatar fallback/custom/reset, ID-based friend deduplication and homonyms, card-level main roster with chat-isolated threads, shared editable persona, legacy migration, and forged identity rejection.',
  );
})().catch(error => {
  console.error(error);
  app.unmount();
  process.exitCode = 1;
});
