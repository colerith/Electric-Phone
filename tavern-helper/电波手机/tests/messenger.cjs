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
let vars = { script: {}, chat: {} };
let chatId = 'test';
Object.assign(global, {
  SillyTavern: {
    name1: 'User',
    getCurrentChatId: () => chatId,
    characterId: '1',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    characters: [{ name: 'Other', avatar: 'other.png' }],
  },
  getCharData: value =>
    value === 'other.png'
      ? { name: 'Other', avatar: 'other.png', shallow: true }
      : { name: 'Alice', description: '角色卡描述：喜欢旅行。' },
  fetch: async (url, options) => {
    assert.equal(url, '/api/characters/get');
    assert.equal(JSON.parse(options.body).avatar_url, 'other.png');
    return {
      ok: true,
      json: async () => ({ name: 'Other', avatar: 'other.png', data: { description: '其他卡片描述' } }),
    };
  },
  getWorldbookNames: () => ['其他世界书', '角色设定'],
  getCharWorldbookNames: () => ({ primary: '角色设定', additional: [] }),
  getWorldbook: async () => [{ uid: 7, name: 'Dora', content: '世界书角色资料'.repeat(200) }],
  getCharAvatarPath: value => (value === 'other.png' ? '/characters/other.png' : ''),
  getChatMessages: () => [],
  getVariables: ({ type }) => vars[type],
  replaceVariables: (v, { type }) => (vars[type] = v),
});
const vue = require('vue'),
  { createPinia } = require('pinia');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { usePhoneStore } = require(base + '/stores/phone.ts'),
  Messenger = require(base + '/components/chat/WaveMessenger.vue').default,
  GroupSettings = require(base + '/components/chat/WaveGroupSettings.vue').default,
  Generation = require(base + '/components/settings/WaveGenerationSettings.vue').default,
  { phoneSurfaceKey } = require(base + '/services/core/ui-context.ts');
const { chooseFollowModules } = require(base + '/services/generation/follow-generation.ts'),
  { buildChatReference, resolveNarrativeRelation } = require(base + '/services/generation/narrative-context.ts');
const { buildModulePrompt, buildPhonePrompts } = require(base + '/prompts/index.ts');
let phone, component;
const surface = vue.ref(null);
let opened = '';
const app = vue.createApp({
  setup() {
    phone = usePhoneStore();
    phone.settings.basic.cacheEnabled = false;
    vue.provide(phoneSurfaceKey, surface);
    return () =>
      vue.h('section', { ref: surface }, [
        vue.h(Messenger, {
          ref: v => (component = v),
          userName: 'User',
          userAvatar: '',
          onOpen: key => (opened = key),
        }),
        vue.h(Generation),
        vue.h(GroupSettings, { userAvatar: '/User Avatars/persona.png' }),
      ]);
  },
});
app.use(createPinia()).mount('#app');
const tick = () => vue.nextTick();
const clickText = (selector, text) => {
  const button = [...document.querySelectorAll(selector)].find(el => el.textContent.includes(text));
  assert(button, 'missing ' + text);
  button.click();
};
(async () => {
  await phone.synchronize();
  await tick();
  assert.equal(document.querySelectorAll('.messenger-row').length, 1);
  assert(!document.body.textContent.includes('私聊讯号'));
  assert(!document.body.textContent.includes('立即生成所选模块'));
  const alice = phone.activeIdentity.charKey;
  const bob = phone.addContact('Bob', '朋友');
  await phone.synchronize();
  assert.equal(phone.state.identities[bob].source, 'local_contact');
  assert.equal(phone.state.mode, 'single');
  phone.startConversation(bob);
  await tick();
  assert.equal(document.querySelectorAll('.messenger-swipe-row').length, 2);
  document.querySelector('.messenger-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  await tick();
  assert(document.querySelector('.revealed'));
  document.querySelector('.revealed .messenger-row-actions button').click();
  await tick();
  assert(Object.values(phone.state.threads).some(thread => thread.pinned));
  phone.removeConversation(bob);
  await phone.synchronize();
  assert.equal(Object.values(phone.state.threads).find(t => t.charKey === bob).hidden, true);
  phone.startConversation(bob);
  assert.equal(phone.activeThread.hidden, false);
  component.toggleMenu();
  await tick();
  assert.equal(document.querySelectorAll('[role=menuitem]').length, 5);
  clickText('[role=menuitem]', '添加好友');
  await tick();
  assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-label'), '添加好友');
  assert(surface.value.contains(document.querySelector('[role=dialog]')));
  const input = document.querySelector('[role=dialog] input');
  input.value = 'Clara';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  clickText('[role=dialog] button', '添加好友');
  await tick();
  assert(phone.identities.some(i => i.name === 'Clara'));
  const clara = phone.identities.find(i => i.name === 'Clara');
  const claraRow = [...document.querySelectorAll('.contact-swipe-row')].find(row => row.textContent.includes('Clara'));
  assert(claraRow);
  claraRow.querySelector('.messenger-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  await tick();
  claraRow.querySelector('.messenger-row-actions button').click();
  await tick();
  assert(!phone.state.identities[clara.charKey]);
  assert(phone.state.deletedCharKeys.includes(clara.charKey));
  component.toggleMenu();
  await tick();
  clickText('[role=menuitem]', '创建群聊');
  await tick();
  const choices = [...document.querySelectorAll('.messenger-group-picker [role=checkbox]')];
  assert(choices.length >= 2);
  assert.equal(choices[0].getAttribute('aria-checked'), 'false');
  choices[0].click();
  await tick();
  assert(choices[0].classList.contains('is-selected'));
  assert.equal(choices[0].getAttribute('aria-checked'), 'true');
  assert(choices[0].querySelector('.messenger-member-check .fa-check'));
  assert(document.querySelector('.messenger-dialog .settings-save-wide').disabled);
  choices[1].click();
  await tick();
  assert(!document.querySelector('.messenger-dialog .settings-save-wide').disabled);
  if (process.env.WAVE_QA_GROUP_HTML)
    fs.writeFileSync(process.env.WAVE_QA_GROUP_HTML, document.querySelector('.messenger-dialog').outerHTML);
  assert(document.querySelector('[aria-label="仅围观"]').disabled);
  assert.equal(document.querySelector('[aria-label="仅围观"]').getAttribute('aria-checked'), 'true');
  await tick();
  document.querySelector('[aria-label="选择群主"]').click();
  await tick();
  assert(![...document.querySelectorAll('[role=option]')].some(item => item.textContent.trim() === '我'));
  clickText('[role=option]', 'Bob');
  await tick();
  document.querySelector('.messenger-dialog .settings-save-wide').click();
  await tick();
  const observer = phone.activeIdentity.charKey;
  await tick();
  assert.equal(phone.activeIdentity.groupOwnerKey, bob);
  assert.equal(phone.activeIdentity.groupMembers.user, undefined);
  assert.equal(document.querySelectorAll('.wave-group-settings .group-member-row').length, 2);
  assert.equal(document.querySelectorAll('.wave-group-settings .wave-group-avatar-cell').length, 2);
  await assert.rejects(phone.sendMessage('不能发送'), /仅可围观/);
  await phone.synchronize();
  assert.equal(phone.state.identities[observer].groupObserver, true);
  assert.equal(phone.state.identities[observer].groupMembers.user, undefined);
  assert.equal(phone.state.identities[observer].groupOwnerKey, bob);
  phone.deleteContact(observer);
  const group = phone.createGroup('一起聊天', [alice, bob]);
  assert.equal(phone.state.identities[group].groupObserver, true, '两位联系人强制仅围观');
  assert.notEqual(phone.state.identities[group].groupOwnerKey, 'user');
  // Existing three-person groups remain joined; exercise their unchanged management behavior.
  phone.state.identities[group].groupObserver = false;
  phone.state.identities[group].groupOwnerKey = 'user';
  phone.startConversation(group);
  await phone.synchronize();
  assert.equal(phone.activeIdentity.source, 'local_group');
  assert.deepEqual([...phone.activeIdentity.memberKeys], [alice, bob]);
  assert.equal(phone.activeIdentity.groupOwnerKey, 'user');
  await tick();
  assert.equal(document.querySelector('.group-member-avatar img').getAttribute('src'), '/User Avatars/persona.png');
  const groupAvatar = () => document.querySelector('.wave-group-settings .wave-group-avatar-grid');
  assert.equal(groupAvatar().children.length, 3, '三人群头像不保留空格');
  assert.equal(groupAvatar().querySelector('img').getAttribute('src'), '/User Avatars/persona.png');
  const originalAliceAvatar = phone.state.identities[alice].avatar;
  phone.state.identities[alice].avatar = 'updated-member.png';
  await tick();
  assert(groupAvatar().querySelector('img[src="updated-member.png"]'), '成员头像更新即时反映到群头像');
  phone.updateActiveIdentityProfile({ avatar: 'custom-group.png' });
  await tick();
  assert.equal(groupAvatar(), null, '手动上传的群头像优先');
  phone.updateActiveIdentityProfile({ resetAvatar: true });
  phone.state.identities[alice].avatar = originalAliceAvatar;
  await tick();
  assert.equal(groupAvatar().children.length, 3, '清除自定义头像后恢复三人布局');
  phone.selectIdentity(alice);
  phone.startConversation(group);
  phone.currentPage = 'conversation';
  phone.currentPage = 'home';
  assert.equal(phone.activeIdentity.charKey, alice, '离开群聊后恢复真实角色');
  assert.equal(phone.state.activeCharKey, alice, 'App 的读写目标同步恢复');
  phone.startConversation(group);
  phone.currentPage = 'conversation';
  phone.currentPage = 'memo';
  assert.equal(phone.activeIdentity.charKey, alice, '直接打开 App 也不能沿用群聊');
  phone.startConversation(group);
  phone.currentPage = 'conversation';
  await tick();

  assert.equal(document.querySelectorAll('.wave-group-settings .group-member-row').length, 3);
  const nameInput = document.querySelector('.wave-group-settings input[maxlength="40"]');
  nameInput.value = '新群名';
  nameInput.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert.equal(phone.activeIdentity.name, '新群名');
  const announcement = document.querySelector('.wave-group-settings textarea');
  announcement.value = '请文明聊天';
  announcement.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert.equal(phone.activeIdentity.groupAnnouncement, '请文明聊天');
  phone.updateGroupDetails({ autoTranslate: true, voiceFollowPrivate: true });
  const bobEdit = document.querySelector(`[aria-label="编辑Bob"]`);
  bobEdit.click();
  await tick();
  assert(surface.value.contains(document.querySelector('.group-edit-dialog')));
  const memberInputs = document.querySelectorAll('.group-edit-dialog input');
  memberInputs[0].value = '小波';
  memberInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  memberInputs[1].value = '闪光';
  memberInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('.group-edit-dialog [aria-label="设为管理员"]').click();
  document.querySelector('.group-edit-dialog [aria-label="禁言"]').click();
  await tick();
  clickText('.group-edit-dialog button', '保存');
  await tick();
  assert.deepEqual(phone.activeIdentity.groupMembers[bob], {
    nickname: '小波',
    title: '闪光',
    level: 1,
    messageCount: 0,
    experience: 0,
    admin: true,
    muted: true,
  });
  phone.updateGroupMember(bob, { muted: false });
  await phone.synchronize();
  assert.equal(phone.activeIdentity.groupMembers[bob].title, '闪光');
  assert.equal(phone.activeIdentity.groupAutoTranslate, true);
  const groupPromptInput = {
    cardKey: 'card',
    chatKey: 'test',
    cardName: 'Alice',
    identity: phone.activeIdentity,
    thread: phone.activeThread,
    appSnapshot: phone.activeSnapshot,
    availableStickers: '',
    presets: phone.settings.presets,
    moduleSettings: phone.settings.moduleSettings,
    voiceServices: phone.settings.voiceServices,
    groupMembers: [phone.state.identities[alice], phone.state.identities[bob]],
    groupPreferences: {
      [alice]: { sourceLanguage: '韩语', targetLanguage: '简体中文' },
      [bob]: { sourceLanguage: '日语', targetLanguage: '简体中文' },
    },
    groupVoices: { [alice]: { provider: 'off' }, [bob]: { provider: 'off' } },
  };
  const followPrompt = buildModulePrompt(groupPromptInput, ['messages'], true);
  assert(followPrompt.includes('群聊消息协议'));
  const observerPrompt = buildModulePrompt(
    { ...groupPromptInput, identity: { ...groupPromptInput.identity, groupObserver: true } },
    ['messages'],
  );
  assert(observerPrompt.includes('User 不在本群，仅围观'));
  assert(followPrompt.includes('messages=[]'));
  assert(followPrompt.includes('actorKey'));
  assert(followPrompt.includes('韩语') && followPrompt.includes('日语'));
  assert(!followPrompt.includes('至少 1 条、最多'));
  assert(!buildPhonePrompts(groupPromptInput).some(item => item.content?.startsWith('[电波手机·私聊回复]')));
  assert(buildPhonePrompts(groupPromptInput).some(item => item.content?.startsWith('[电波手机·群聊最终输出协议]')));
  phone.updateGroupDetails({ autoTranslate: false });
  assert.equal(phone.state.mode, 'single');
  phone.settings.generation.followEnabled = true;
  phone.settings.generation.requiredModules = ['status'];
  phone.settings.generation.modules = ['status', 'memo'];
  phone.settings.generation.probability = 0;
  assert.deepEqual(
    chooseFollowModules(phone.settings.generation, () => 0),
    ['status'],
  );
  phone.settings.generation.probability = 100;
  assert.deepEqual(
    chooseFollowModules(phone.settings.generation, () => 0),
    ['status', 'memo'],
  );
  await tick();
  const randomButtons = document.querySelectorAll('.generation-module-group')[1].querySelectorAll('button');
  [...randomButtons].find(button => button.textContent.includes('状态')).click();
  await tick(); // preexisting duplicate toggles off random
  [...randomButtons].find(button => button.textContent.includes('状态')).click();
  await tick();
  assert(!phone.settings.generation.requiredModules.includes('status'));
  assert(phone.settings.generation.modules.includes('status'));
  phone.activeThread.messages.push({
    id: 'x',
    clientId: '',
    sender: 'char',
    type: 'text',
    content: '周末再聊',
    createdAt: new Date().toISOString(),
    status: 'sent',
    payload: { narrativeRelation: 'independent' },
    withdrawn: false,
  });
  assert(buildChatReference(phone.state).includes('独立聊天参考'));
  phone.activeThread.messages[0].payload.waveFloor = true;
  assert(buildChatReference(phone.state).includes('酒馆跟随生成'));
  assert.equal(resolveNarrativeRelation('auto', 'linked'), 'linked');
  assert.equal(resolveNarrativeRelation('auto'), 'independent');
  phone.activeThread.hidden = true;
  assert.equal(buildChatReference(phone.state), '');
  phone.activeThread.hidden = false;
  const { resolveGroupActor } = require(base + '/services/chat/group-replies.ts');
  assert.equal(resolveGroupActor(phone.activeIdentity, phone.state.identities, { actorKey: ' Alice ' }), alice);
  assert.throws(() => resolveGroupActor(phone.activeIdentity, phone.state.identities, {}), /缺少发言者/);
  assert.throws(
    () => resolveGroupActor(phone.activeIdentity, phone.state.identities, { actorKey: alice, actorName: 'Bob' }),
    /无法唯一/,
  );
  const beforeDraftMessages = phone.activeThread.messages.length;
  assert.doesNotThrow(() => phone.setDraft('编辑内容'));
  assert.doesNotThrow(() => phone.setDraft(''));
  assert.equal(phone.activeThread.draft, '');
  assert.equal(phone.activeThread.messages.length, beforeDraftMessages, '编辑草稿不得产生群头像通知');
  const { stickerPrompt, inlineStickerParts } = require(base + '/services/chat/stickers.ts');
  const stickerList = stickerPrompt(phone.activeIdentity, [
    { name: '成员表情', url: 'https://example.com/a.png', scope: 'char', charKey: alice },
    { name: '别人表情', url: 'https://example.com/b.png', scope: 'char', charKey: 'outsider' },
  ]);
  assert(stickerList.includes('成员表情') && !stickerList.includes('别人表情'));
  assert.deepEqual(inlineStickerParts('好自为之：[https://example.com/a.jpg]'), [
    { text: '好自为之：' },
    { url: 'https://example.com/a.jpg' },
  ]);
  assert.deepEqual(inlineStickerParts('[https://example.com/page]'), [{ text: '[https://example.com/page]' }]);
  assert(followPrompt.includes('content 必须使用该成员 sourceLanguage'));
  assert(followPrompt.includes('payload.translation 必须使用该成员 targetLanguage'));
  const MessageContent = require(base + '/components/chat/WaveMessageContent.vue').default;
  const preview = document.createElement('div');
  document.body.append(preview);
  phone.updateGroupDetails({ autoTranslate: true });
  const renderMessage = message => {
    const vnode = vue.h(MessageContent, { message });
    vnode.appContext = app._context;
    vue.render(vnode, preview);
  };
  renderMessage({
    id: 'render-sticker',
    sender: 'char',
    type: 'text',
    content: '好自为之：[https://example.com/a.jpg]',
    payload: { actorKey: alice },
  });
  await tick();
  assert.equal(preview.querySelector('.wave-inline-sticker').getAttribute('src'), 'https://example.com/a.jpg');
  renderMessage({
    id: 'render-bilingual',
    sender: 'char',
    type: 'text',
    content: 'こんばんは',
    payload: { actorKey: alice, translation: '晚上好' },
  });
  await tick();
  assert.equal(preview.querySelector('.wave-original-text').textContent, 'こんばんは');
  assert.equal(preview.querySelector('.wave-translation-bubble').textContent.trim(), '晚上好');
  vue.render(null, preview);
  preview.remove();
  phone.updateGroupDetails({ autoTranslate: false });

  phone.settings.api.enabled = true;
  phone.settings.api.apiurl = 'https://test.invalid/v1';
  phone.settings.api.model = 'test';
  phone.settings.generation.narrativeMode = 'independent';
  phone.settings.sendMode = 'secondary_api';
  global.generateRaw = async () =>
    JSON.stringify({
      version: 1,
      char_id: group,
      char_name: phone.activeIdentity.name,
      messages: [{ sender: 'char', type: 'text', content: '主动消息', payload: { actor_key: '小波' } }],
      app_updates: {},
    });
  phone.updateGroupMember(bob, { muted: true });
  await assert.rejects(phone.generateModule('messages'), /禁言/);
  phone.updateGroupMember(bob, { muted: false });
  assert.match(await phone.generateModule('messages'), /新内容/);
  assert.equal(phone.activeThread.messages.at(-1).content, '主动消息');
  global.generateRaw = async args => {
    assert(!args.ordered_prompts.includes('chat_history'));
    assert(args.user_input.includes('群聊'));
    return (
      '<electric>演示记录 {not json}</electric>' +
      JSON.stringify({
        context_relation: 'linked',
        thread_id: phone.activeThread.id,
        messages: [{ sender: 'char', type: 'voice', content: '大家晚上好', actor_key: 'Alice', payload: {} }],
        app_updates: {},
      })
    );
  };
  await phone.sendMessage('群里晚上好', true);
  assert.equal(phone.activeThread.messages.at(-1).content, '大家晚上好');
  assert.equal(phone.activeThread.messages.at(-1).type, 'text', '未启用语音时保留文字回复');
  assert.equal(phone.activeThread.messages.at(-1).payload.electric, '演示记录 {not json}');
  assert.equal(phone.activeThread.messages.at(-1).payload.narrativeRelation, 'independent');
  assert.equal(phone.activeThread.messages.at(-1).payload.actorKey, alice);
  phone.updateGroupMember(bob, { transferOwner: true });
  assert.equal(phone.activeIdentity.groupOwnerKey, bob);
  assert.throws(() => phone.updateGroupMember(alice, { admin: true }), /只有群主/);
  assert.throws(() => phone.updateActiveIdentityProfile({ avatar: 'https://example.com/group.png' }), /只有群主/);
  const beforeCount = phone.activeThread.messages.filter(message => message.sender === 'char').length;
  global.generateRaw = async () =>
    JSON.stringify({
      thread_id: phone.activeThread.id,
      messages: [{ sender: 'char', content: '错误成员', payload: { actorKey: 'unknown' } }],
      app_updates: {},
    });
  await assert.rejects(phone.sendMessage('再聊一句', true), /第 1 条回复无效.*无法唯一对应群成员/);
  assert.equal(phone.activeThread.messages.filter(message => message.sender === 'char').length, beforeCount);
  assert(phone.activeThread.messages.some(message => message.status === 'failed'));

  component.toggleMenu();
  await tick();
  clickText('[role=menuitem]', '从角色卡描述导入');
  await tick();
  assert.equal(document.querySelector('[role=dialog] input').value, 'Alice');
  assert.equal(document.querySelector('[role=dialog] textarea').value, '角色卡描述：喜欢旅行。');
  clickText('[role=dialog] button', '导入角色');
  await tick();
  await phone.synchronize();
  assert.equal(phone.state.identities[alice].about, '角色卡描述：喜欢旅行。');
  assert.equal(phone.identities.filter(identity => identity.name === 'Alice').length, 1);

  component.toggleMenu();
  await tick();
  clickText('[role=menuitem]', '从角色卡描述导入');
  await tick();
  assert(document.querySelector('[aria-label="选择角色卡"]').textContent.includes('当前卡片'));
  document.querySelector('[aria-label="选择角色卡"]').click();
  await tick();
  clickText('[role=option]', 'Other');
  await tick();
  await tick();
  await tick();
  assert.equal(document.querySelector('[role=dialog] textarea').value, '其他卡片描述');
  const importedName = document.querySelector('[role=dialog] input');
  importedName.value = '改名角色';
  importedName.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  clickText('[role=dialog] button', '导入角色');
  await tick();
  const otherCard = phone.identities.find(identity => identity.name === '改名角色');
  assert.equal(otherCard.about, '其他卡片描述');
  assert.equal(otherCard.avatar, '/characters/other.png');

  // Exercise the worldbook import through the real Vue dialog.
  component.toggleMenu();
  await tick();
  clickText('[role=menuitem]', '从世界书导入角色');
  await tick();
  const bookSelect = document.querySelector('[role=dialog] [aria-label="选择世界书"]');
  assert(bookSelect.textContent.includes('角色设定'), 'bound character worldbook is selected by default');
  bookSelect.click();
  await tick();
  clickText('[role=dialog] [role=option]', '其他世界书');
  await tick();
  await tick();
  document.querySelector('[role=dialog] [aria-label="选择要导入的角色条目"]').click();
  await tick();
  clickText('[role=dialog] [role=option]', 'Dora');
  await tick();
  assert.equal(document.querySelector('[role=dialog] input').value, 'Dora');
  clickText('[role=dialog] button', '导入角色');
  await tick();
  const imported = phone.identities.find(identity => identity.name === 'Dora');
  assert.equal(imported.about, '世界书角色资料'.repeat(200));
  phone.selectIdentity(bob);
  phone.updateActiveIdentityProfile({ remark: '老朋友', avatar: 'custom.png', avatarZoom: 1.5 });
  phone.setContactDetails({ actorType: 'npc', npcProfile: '保留的角色资料', relationshipToUser: '朋友' });
  phone.startConversation(bob);
  await phone.sendMessage('只属于旧聊天', false);
  const oldChat = structuredClone(vars.chat);
  chatId = 'new-chat';
  vars.chat = {};
  await phone.synchronize();
  assert.equal(phone.state.identities[bob].remark, '老朋友');
  assert.equal(phone.state.identities[bob].avatar, 'custom.png');
  assert.equal(phone.state.identities[bob].npcProfile, '保留的角色资料');
  assert.equal(phone.state.identities[imported.charKey].about, imported.about);
  assert.equal(phone.state.identities[alice].about, '角色卡描述：喜欢旅行。');
  assert(!phone.state.identities[clara.charKey], 'deleted contacts must not return');
  assert(
    Object.values(phone.state.threads).every(thread => !thread.messages.length),
    'new chat starts with empty records',
  );
  chatId = 'test';
  vars.chat = oldChat;
  await phone.synchronize();
  assert(
    Object.values(phone.state.threads).some(thread =>
      thread.messages.some(message => message.content === '只属于旧聊天'),
    ),
  );

  clickText('.messenger-dock button', '我的');
  await tick();
  assert.equal(component.headerIcon, '');
  for (const [label, title] of [['编辑资料', '编辑资料']]) {
    clickText('.moments-me-menu button', label);
    await tick();
    assert.equal(component.headerTitle, title);
    assert(!document.querySelector('.messenger-bottom'));
    assert(!document.querySelector('.moments-subheading'));
    assert.equal(component.handleBack(), true);
    await tick();
    assert.equal(component.headerTitle, '我的');
    assert(document.querySelector('.messenger-dock'));
  }
  app.unmount();
  console.log(
    'PASS: actual Vue messenger menu/dialog, contacts, persistent pin/remove/reopen, local groups across sync, module mutual exclusivity and required/random selection, narrative provenance.',
  );
})().catch(e => {
  console.error(e);
  app.unmount();
  process.exitCode = 1;
});
