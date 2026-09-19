<template>
  <section ref="root" class="messenger-app">
    <div class="messenger-scroll">
      <div v-if="tab === 'messages'" class="messenger-profile">
        <span class="messenger-avatar large"
          ><img v-if="userAvatar" :src="userAvatar" alt="" /><span v-else>{{ userName.slice(0, 1) }}</span></span
        >
        <div>
          <strong>{{ userName }}</strong
          ><small>{{ contacts.length }} 位联系人 · {{ groups.length }} 个群聊</small>
          <p>把想说的话，留在这里。</p>
        </div>
      </div>
      <template v-if="tab === 'messages'">
        <div class="messenger-filters" role="tablist" aria-label="会话筛选">
          <button
            v-for="item in filters"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="filter === item.id"
            @click="filter = item.id"
          >
            {{ item.name }}
          </button>
        </div>
        <div v-for="section in sections" :key="section.name" class="messenger-list-group">
          <div v-if="section.name === '置顶'" class="messenger-section-label">置顶</div>
          <div
            v-for="row in section.rows"
            :key="row.identity.charKey"
            class="messenger-swipe-row"
            :class="{ revealed: revealed === row.identity.charKey }"
          >
            <div class="messenger-row-actions" :aria-hidden="revealed !== row.identity.charKey">
              <button
                type="button"
                :tabindex="revealed === row.identity.charKey ? 0 : -1"
                @click="pin(row.identity.charKey)"
              >
                {{ row.thread?.pinned ? '取消置顶' : '置顶' }}</button
              ><button
                type="button"
                :tabindex="revealed === row.identity.charKey ? 0 : -1"
                @click="remove(row.identity.charKey)"
              >
                删除
              </button>
            </div>
            <button
              class="messenger-row"
              type="button"
              :aria-label="`${row.identity.name}，${preview(row.identity.charKey)}`"
              @click="openRow(row.identity.charKey)"
              @contextmenu.prevent="revealed = row.identity.charKey"
              @pointerdown="startSwipe($event, row.identity.charKey)"
              @pointerup="endSwipe"
              @pointercancel="swipe = null"
              @keydown.delete.prevent="revealed = row.identity.charKey"
            >
              <span class="messenger-avatar"
                ><img
                  v-if="row.identity.avatar"
                  :src="row.identity.avatar"
                  alt=""
                  :style="avatarStyle(row.identity)"
                /><i v-else-if="row.identity.source === 'local_group'" class="fa-solid fa-user-group"></i
                ><span v-else>{{ displayIdentityName(row.identity).slice(0, 1) }}</span
                ><b v-if="row.thread?.unread">{{ row.thread.unread > 99 ? '99+' : row.thread.unread }}</b></span
              >
              <span class="messenger-row-copy"
                ><strong>{{ displayIdentityName(row.identity) }}</strong
                ><small>{{ preview(row.identity.charKey) }}</small></span
              >
              <span class="messenger-row-meta"
                ><time>{{ timeLabel(row.thread?.messages.at(-1)?.createdAt) }}</time
                ><i v-if="row.thread?.generating" class="fa-solid fa-ellipsis fa-fade"></i
                ><i v-else-if="row.thread?.pinned" class="fa-solid fa-thumbtack"></i
              ></span>
            </button>
          </div>
        </div>
        <div v-if="!sections.length" class="messenger-empty">
          {{ query ? '没有匹配的会话' : '暂无会话，点击右上角 + 发起聊天' }}
        </div>
      </template>
      <template v-else-if="tab === 'contacts'">
        <nav class="contact-alphabet" aria-label="联系人字母索引">
          <button v-for="group in contactGroups" :key="group.letter" type="button" @click="jumpLetter(group.letter)">
            {{ group.letter }}
          </button>
        </nav>
        <section
          v-for="group in contactGroups"
          :key="group.letter"
          :data-contact-letter="group.letter"
          class="contact-letter-group"
        >
          <div class="messenger-section-label">{{ group.letter }}</div>
          <div class="messenger-list-group">
            <div
              v-for="contact in group.contacts"
              :key="contact.charKey"
              class="messenger-swipe-row contact-swipe-row"
              :class="{ revealed: revealed === contact.charKey }"
            >
              <div class="messenger-row-actions" :aria-hidden="revealed !== contact.charKey">
                <button
                  type="button"
                  :tabindex="revealed === contact.charKey ? 0 : -1"
                  @click="deleteContact(contact.charKey)"
                >
                  删除
                </button>
              </div>
              <button
                class="messenger-row"
                type="button"
                @click="openRow(contact.charKey)"
                @contextmenu.prevent="revealed = contact.charKey"
                @pointerdown="startSwipe($event, contact.charKey)"
                @pointerup="endSwipe"
                @pointercancel="swipe = null"
                @keydown.delete.prevent="revealed = contact.charKey"
              >
                <span class="messenger-avatar"
                  ><img v-if="contact.avatar" :src="contact.avatar" alt="" :style="avatarStyle(contact)" /><span
                    v-else
                    >{{ contact.name.slice(0, 1) }}</span
                  ></span
                ><span class="messenger-row-copy"
                  ><strong>{{ displayIdentityName(contact) }}</strong
                  ><small>{{ contact.about || '点击发起聊天' }}</small></span
                >
              </button>
            </div>
          </div>
        </section>
        <div v-if="!filteredContacts.length" class="messenger-empty">暂无匹配的联系人</div>
      </template>
      <WaveMoments
        v-else
        ref="moments"
        :key="tab"
        view="me"
        context="messenger"
        :user-name="userName"
        :user-avatar="userAvatar"
        @share="(post, author) => $emit('share-moment', post, author)"
      />
    </div>
    <div v-if="!momentsSubpage" class="messenger-bottom">
      <label v-if="tab === 'messages' || tab === 'contacts'" class="messenger-search"
        ><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i
        ><input
          v-model="query"
          :placeholder="tab === 'contacts' ? '搜索联系人' : '搜索聊天'"
          :aria-label="tab === 'contacts' ? '搜索联系人' : '搜索聊天'"
      /></label>
      <nav class="messenger-dock" aria-label="消息应用导航">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          :aria-current="tab === item.id ? 'page' : undefined"
          @click="changeTab(item.id)"
        >
          <i :class="item.icon" aria-hidden="true"></i><span>{{ item.name }}</span>
        </button>
      </nav>
    </div>
    <div v-if="menuOpen" class="messenger-plus-menu" role="menu" aria-label="新增">
      <button v-for="item in menuItems" :key="item.id" type="button" role="menuitem" @click="showDialog(item.id)">
        <i :class="item.icon"></i>{{ item.name }}
      </button>
    </div>
    <Teleport v-if="dialog && surface" :to="surface">
      <div
        class="messenger-modal"
        @click.self="closeDialog"
        @keydown.esc.stop.prevent="closeDialog"
        @keydown="trapFocus"
      >
        <section
          ref="dialogElement"
          class="messenger-dialog wave-settings-surface"
          role="dialog"
          aria-modal="true"
          :aria-label="dialogTitle"
          tabindex="-1"
        >
          <div class="messenger-dialog-heading">
            <div class="wave-settings-title">{{ dialogTitle }}</div>
            <button type="button" aria-label="关闭" @click="closeDialog">×</button>
          </div>
          <template v-if="dialog === 'friend'">
            <label>联系人名称<input v-model="newName" maxlength="40" placeholder="填写名称" /></label>
            <label
              >联系人资料<textarea
                v-model="about"
                maxlength="1000"
                rows="3"
                placeholder="关系、性格或已知背景（选填）"
              ></textarea>
            </label>
            <p>添加到当前手机通讯录，资料用于这位联系人的回复。</p>
            <button class="settings-save-wide" type="button" @click="submitFriend">添加好友</button>
          </template>
          <template v-else>
            <label v-if="dialog === 'group'"
              >群聊名称<input v-model="newName" maxlength="40" placeholder="填写群名（选填）"
            /></label>
            <input v-model="contactQuery" placeholder="搜索联系人" aria-label="搜索联系人" />
            <div class="messenger-picker" :role="dialog === 'group' ? 'group' : undefined" aria-label="选择联系人">
              <button
                v-for="contact in pickerContacts"
                :key="contact.charKey"
                type="button"
                :aria-pressed="dialog === 'group' ? memberKeys.includes(contact.charKey) : undefined"
                @click="pick(contact.charKey)"
              >
                <span>{{ displayIdentityName(contact) }}</span
                ><i
                  :class="
                    dialog === 'group' && memberKeys.includes(contact.charKey)
                      ? 'fa-solid fa-circle-check'
                      : dialog === 'group'
                        ? 'fa-regular fa-circle'
                        : 'fa-solid fa-chevron-right'
                  "
                ></i>
              </button>
            </div>
            <p v-if="!pickerContacts.length">没有匹配的联系人，可先从加号菜单添加好友。</p>
            <button
              v-if="dialog === 'group'"
              class="settings-save-wide"
              type="button"
              :disabled="memberKeys.length < 2"
              @click="submitGroup"
            >
              创建群聊（{{ memberKeys.length }} 位联系人 + 我）
            </button>
          </template>
          <p v-if="notice" role="status">{{ notice }}</p>
        </section>
      </div>
    </Teleport>
  </section>
</template>
<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { displayIdentityName } from '../../services/core/identity';
import { formatMessagePreview } from '../../services/chat/message-format';
import WaveMoments from '../space/WaveMoments.vue';
import { groupContacts } from '../../services/chat/contact-alphabet';
import { phoneSurfaceKey } from '../../services/core/ui-context';
import type { Identity } from '../../schemas';
import type { MomentPost } from '../../services/space/moments';
defineProps<{ userName: string; userAvatar: string }>();
const emit = defineEmits<{
  open: [key: string];
  activity: [key: string];
  settings: [];
  appearance: [];
  'tab-change': [tab: string];
  'share-moment': [post: MomentPost, author: string];
}>();
const phone = usePhoneStore(),
  surface = inject(phoneSurfaceKey, ref(null));
type Tab = 'messages' | 'contacts' | 'me';
type Dialog = 'start' | 'friend' | 'group';
const tabs: { id: Tab; name: string; icon: string }[] = [
  { id: 'messages', name: '消息', icon: 'fa-solid fa-comment' },
  { id: 'contacts', name: '联系人', icon: 'fa-regular fa-address-book' },
  { id: 'me', name: '我的', icon: 'fa-regular fa-user' },
];
const filters = [
  { id: 'all', name: '全部' },
  { id: 'private', name: '私聊' },
  { id: 'groups', name: '群聊' },
];
const menuItems: { id: Dialog; name: string; icon: string }[] = [
  { id: 'start', name: '发起聊天', icon: 'fa-regular fa-comment' },
  { id: 'friend', name: '添加好友', icon: 'fa-solid fa-user-plus' },
  { id: 'group', name: '创建群聊', icon: 'fa-solid fa-user-group' },
];
const tab = ref<Tab>('messages'),
  filter = ref('all'),
  query = ref(''),
  menuOpen = ref(false),
  revealed = ref('');
const root = ref<HTMLElement | null>(null),
  dialogElement = ref<HTMLElement | null>(null),
  dialog = ref<Dialog | null>(null);
const newName = ref(''),
  about = ref(''),
  contactQuery = ref(''),
  memberKeys = ref<string[]>([]),
  notice = ref('');
const dialogTitle = computed(() => menuItems.find(item => item.id === dialog.value)?.name || '');
const contacts = computed(() => phone.identities.filter(identity => identity.source !== 'local_group'));
const groups = computed(() => phone.identities.filter(identity => identity.source === 'local_group'));
const matches = (identity: Identity, text: string) =>
  `${identity.name} ${identity.remark}`.toLowerCase().includes(text.trim().toLowerCase());
const filteredContacts = computed(() => contacts.value.filter(identity => matches(identity, query.value)));
const pickerContacts = computed(() => contacts.value.filter(identity => matches(identity, contactQuery.value)));
function threadFor(key: string) {
  return Object.values(phone.state.threads).find(thread => thread.charKey === key);
}
function preview(key: string) {
  const identity = phone.identities.find(item => item.charKey === key);
  const last = threadFor(key)?.messages.at(-1);
  const actorKey = String(last?.payload.actorKey || '');
  const actor = identity?.source === 'local_group' ? phone.state.identities[actorKey] : undefined;
  return last
    ? formatMessagePreview(last, actor ? displayIdentityName(actor) : '')
    : phone.state.snapshots[key]?.messages.split('\n').filter(Boolean).at(-1) || '开始一段新的聊天';
}
const sections = computed(() => {
  const rows = phone.identities
    .map(identity => ({ identity, thread: threadFor(identity.charKey) }))
    .filter(
      row =>
        !row.thread?.hidden &&
        matches(row.identity, query.value) &&
        (filter.value === 'all' || (filter.value === 'groups') === (row.identity.source === 'local_group')),
    )
    .sort((a, b) =>
      (b.thread?.messages.at(-1)?.createdAt || b.thread?.updatedAt || '').localeCompare(
        a.thread?.messages.at(-1)?.createdAt || a.thread?.updatedAt || '',
      ),
    );
  return [
    { name: '置顶', rows: rows.filter(row => row.thread?.pinned) },
    { name: '会话', rows: rows.filter(row => !row.thread?.pinned) },
  ].filter(section => section.rows.length);
});
const moments = ref<InstanceType<typeof WaveMoments> | null>(null);
const contactGroups = computed(() => groupContacts(filteredContacts.value));
function jumpLetter(letter: string) {
  [...(root.value?.querySelectorAll<HTMLElement>('[data-contact-letter]') || [])]
    .find(element => element.dataset.contactLetter === letter)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
const momentsSubpage = computed(() => tab.value === 'me' && !!moments.value?.isSubpage);
const headerTitle = computed(() =>
  momentsSubpage.value
    ? moments.value?.subpageTitle || '我的'
    : { messages: '消息', contacts: '联系人', me: '我的' }[tab.value],
);
const headerIcon = computed(() => (tab.value === 'me' ? '' : 'fa-solid fa-plus'));
const headerLabel = computed(() => '新增聊天或联系人');
function timeLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
function avatarStyle(identity: Identity) {
  const max = Math.max(0, (identity.avatarZoom - 1) * 50);
  return {
    transform: `translate(${Math.max(-max, Math.min(max, identity.avatarOffsetX * 0.32))}%,${Math.max(-max, Math.min(max, identity.avatarOffsetY * 0.32))}%) scale(${identity.avatarZoom})`,
  };
}
function open(key: string) {
  phone.startConversation(key);
  emit('open', key);
}
let suppressClick = false;
function openRow(key: string) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (revealed.value) {
    revealed.value = '';
    return;
  }
  open(key);
}
function pin(key: string) {
  phone.setConversationPinned(key);
  revealed.value = '';
}
function remove(key: string) {
  phone.removeConversation(key);
  revealed.value = '';
}
function deleteContact(key: string) {
  phone.deleteContact(key);
  revealed.value = '';
}
let swipe: { x: number; y: number; key: string } | null = null;
function startSwipe(event: PointerEvent, key: string) {
  if (event.button !== 0) return;
  suppressClick = false;
  swipe = { x: event.clientX, y: event.clientY, key };
}
function endSwipe(event: PointerEvent) {
  if (!swipe) return;
  const dx = event.clientX - swipe.x,
    dy = event.clientY - swipe.y;
  if (Math.abs(dx) > 40 && Math.abs(dy) < 30) {
    revealed.value = dx < 0 ? swipe.key : '';
    suppressClick = true;
  }
  swipe = null;
}
function changeTab(value: Tab) {
  tab.value = value;
  emit('tab-change', value);
  query.value = '';
  revealed.value = '';
  menuOpen.value = false;
}
let previousFocus: HTMLElement | null = null;
async function showDialog(value: Dialog) {
  previousFocus = root.value?.ownerDocument.activeElement as HTMLElement | null;
  menuOpen.value = false;
  dialog.value = value;
  newName.value = '';
  about.value = '';
  contactQuery.value = '';
  memberKeys.value = [];
  notice.value = '';
  await nextTick();
  dialogElement.value?.querySelector<HTMLElement>('input,button')?.focus();
}
function closeDialog() {
  dialog.value = null;
  if (previousFocus?.isConnected) previousFocus.focus();
  else root.value?.closest('.wave-device')?.querySelector<HTMLElement>('[data-messenger-plus]')?.focus();
}
function pick(key: string) {
  if (dialog.value === 'start') {
    closeDialog();
    open(key);
  } else
    memberKeys.value = memberKeys.value.includes(key)
      ? memberKeys.value.filter(value => value !== key)
      : [...memberKeys.value, key];
}
function submitFriend() {
  try {
    phone.addContact(newName.value, about.value);
    closeDialog();
    changeTab('contacts');
  } catch (error) {
    notice.value = String(error);
  }
}
function submitGroup() {
  try {
    const key = phone.createGroup(newName.value, memberKeys.value);
    closeDialog();
    open(key);
  } catch (error) {
    notice.value = String(error);
  }
}
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const elements = [
    ...(dialogElement.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea') || []),
  ];
  const index = elements.indexOf(dialogElement.value?.ownerDocument.activeElement as HTMLElement);
  if (!elements.length) return;
  if (event.shiftKey && index <= 0) {
    event.preventDefault();
    elements.at(-1)?.focus();
  } else if (!event.shiftKey && index === elements.length - 1) {
    event.preventDefault();
    elements[0]?.focus();
  }
}
function outside(event: PointerEvent) {
  if (!(event.target as Element).closest?.('[data-messenger-plus]') && !event.composedPath().includes(root.value!)) {
    menuOpen.value = false;
    revealed.value = '';
  }
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    menuOpen.value = false;
    revealed.value = '';
  }
}
let owner: Document | undefined;
onMounted(() => {
  emit('tab-change', tab.value);
  owner = root.value?.ownerDocument;
  owner?.addEventListener('pointerdown', outside);
  owner?.addEventListener('keydown', escape);
});
onUnmounted(() => {
  owner?.removeEventListener('pointerdown', outside);
  owner?.removeEventListener('keydown', escape);
});
async function toggleMenu() {
  if (tab.value === 'me') {
    if (moments.value?.canPublish) moments.value.openComposer();
    return;
  }
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) {
    await nextTick();
    root.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }
}
defineExpose({
  toggleMenu,
  menuOpen,
  isSubpage: momentsSubpage,
  headerTitle,
  headerIcon,
  headerLabel,
  handleBack: () => moments.value?.back() || false,
});
</script>
