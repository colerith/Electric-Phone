<template>
  <template v-if="group">
    <section class="chat-settings-group wave-group-settings chat-profile-settings">
      <div class="wave-settings-title">群资料</div>
      <WaveImageUpload
        v-if="isOwner"
        :inline="avatarOpen"
        :model-value="group.avatar"
        label="群头像"
        :zoom="group.avatarZoom"
        :offset-x="group.avatarOffsetX"
        :offset-y="group.avatarOffsetY"
        :max-side="phone.settings.media.imageMaxSide"
        :quality="phone.settings.media.imageQuality"
        @cancel="avatarOpen = false"
        @confirm="saveAvatar"
        @reset="
          phone.updateActiveIdentityProfile({ resetAvatar: true });
          avatarOpen = false;
        "
      >
        <template #fallback><WaveGroupAvatar :group="group" :user-avatar="userAvatar" /></template>
      </WaveImageUpload>
      <div v-else class="group-avatar-readonly">
        <img v-if="group.avatar" :src="group.avatar" :style="identityAvatarStyle(group)" alt="群头像" /><WaveGroupAvatar
          v-else
          :group="group"
          :user-avatar="userAvatar"
        />
      </div>
      <label class="chat-setting-block"
        >群名称<input :value="group.name" maxlength="40" :disabled="!isOwner" @change="updateName"
      /></label>
      <label class="chat-setting-block"
        >群公告<textarea
          :value="group.groupAnnouncement || ''"
          rows="4"
          maxlength="2000"
          :disabled="!isOwner"
          placeholder="填写群公告"
          @change="updateAnnouncement"
        />
      </label>
      <p class="chat-settings-note">{{ isOwner ? '你是群主，可管理群资料与成员。' : roleLabel }}</p>
    </section>
    <section class="chat-settings-group wave-group-settings">
      <div class="wave-settings-title">群消息</div>
      <label class="chat-setting-row"
        ><span>自动翻译<small>按发言成员的私聊语言设置翻译，各成员独立</small></span
        ><WaveToggle
          :model-value="Boolean(group.groupAutoTranslate)"
          aria-label="群聊自动翻译"
          @update:model-value="value => phone.updateGroupDetails({ autoTranslate: value })"
      /></label>
      <label class="chat-setting-row"
        ><span>语音跟随私聊<small>各成员使用自己的私聊语音配置，不共享音色</small></span
        ><WaveToggle
          :model-value="Boolean(group.groupVoiceFollowPrivate)"
          aria-label="群聊语音跟随私聊"
          @update:model-value="value => phone.updateGroupDetails({ voiceFollowPrivate: value })"
      /></label>
    </section>
    <WaveCharacterImage />
    <section class="chat-settings-group wave-group-settings">
      <div class="wave-settings-title">群成员 · {{ members.length }}</div>
      <div v-for="member in members" :key="member.key" class="group-member-row">
        <span class="group-member-avatar"
          ><img
            v-if="member.avatar"
            :src="member.avatar"
            :style="member.key === 'user' ? undefined : identityAvatarStyle(phone.state.identities[member.key])"
            alt=""
          /><span v-else>{{ member.name.slice(0, 1) }}</span></span
        >
        <span class="group-member-copy"
          ><strong>{{ member.meta.nickname || member.name }}</strong
          ><small
            >{{ member.role }} · Lv.{{ member.meta.level
            }}<template v-if="member.meta.title"> · {{ member.meta.title }}</template
            ><template v-if="member.meta.muted"> · 已禁言</template></small
          ><small class="group-member-experience">{{ groupExperienceLabel(member.meta) }}</small></span
        >
        <button
          v-if="canEdit"
          type="button"
          class="group-member-edit"
          :aria-label="`编辑${member.name}`"
          @click="editMember(member.key)"
        >
          <i class="fa-solid fa-pen"></i>
        </button>
      </div>
    </section>
    <Teleport v-if="editing" :to="surface || 'body'">
      <div class="group-edit-overlay" @click.self="editing = ''" @keydown.esc.stop="editing = ''">
        <section
          ref="editorDialog"
          class="group-edit-dialog chat-settings-group"
          role="dialog"
          aria-modal="true"
          :aria-label="`编辑${editedMember?.name || '群成员'}`"
          tabindex="-1"
        >
          <div class="wave-settings-title">{{ editedMember?.name }} · 成员管理</div>
          <label class="chat-setting-block"
            >群昵称<input v-model="memberDraft.nickname" maxlength="40" placeholder="留空则使用联系人名称"
          /></label>
          <label class="chat-setting-block"
            >群头衔<input v-model="memberDraft.title" maxlength="30" placeholder="可覆盖群主／管理员铭牌文字"
          /></label>
          <label v-if="isOwner && editing !== ownerKey" class="chat-setting-row"
            ><span>设为管理员</span><WaveToggle v-model="memberDraft.admin" aria-label="设为管理员"
          /></label>
          <label v-if="editing !== ownerKey" class="chat-setting-row"
            ><span>禁言</span><WaveToggle v-model="memberDraft.muted" aria-label="禁言"
          /></label>
          <button
            v-if="isOwner && editing !== 'user' && editing !== ownerKey"
            type="button"
            class="group-edit-link"
            @click="transferOwner"
          >
            转让群主给这位成员
          </button>
          <button
            v-if="editing !== 'user' && editing !== ownerKey && (isOwner || !editedMember?.meta.admin)"
            type="button"
            class="group-edit-link danger"
            @click="removeMember"
          >
            移出群聊
          </button>
          <p v-if="error" class="group-edit-error" role="alert">{{ error }}</p>
          <div class="group-edit-actions">
            <button type="button" @click="editing = ''">取消</button>
            <button type="button" class="group-edit-primary" @click="saveMember">保存</button>
          </div>
        </section>
      </div>
    </Teleport>
  </template>
</template>
<script setup lang="ts">
import { groupExperienceLabel } from '../../services/chat/group-activity';
import { computed, inject, nextTick, ref } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { identityAvatarStyle } from '../../services/core/avatar';
import WaveImageUpload from '../shared/WaveImageUpload.vue';
import WaveGroupAvatar from '../shared/WaveGroupAvatar.vue';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveCharacterImage from './WaveCharacterImage.vue';
import { phoneSurfaceKey } from '../../services/core/ui-context';
const props = defineProps<{ userAvatar?: string }>();
const phone = usePhoneStore();
const surface = inject(phoneSurfaceKey, ref(null));
const group = computed(() => (phone.activeIdentity?.source === 'local_group' ? phone.activeIdentity : null));
const ownerKey = computed(() => group.value?.groupOwnerKey || 'user');
const isOwner = computed(() => !group.value?.groupObserver && ownerKey.value === 'user');
const canEdit = computed(
  () => !group.value?.groupObserver && (isOwner.value || Boolean(group.value?.groupMembers?.user?.admin)),
);
const roleLabel = computed(() =>
  group.value?.groupObserver
    ? '你不在本群中，仅围观。'
    : canEdit.value
      ? '你是群管理员，可编辑群昵称、头衔与普通成员。'
      : '你是群成员。',
);
const members = computed(() => {
  if (!group.value) return [];
  return [...(group.value.groupObserver ? [] : ['user']), ...(group.value.memberKeys || [])].map(key => {
    const identity = phone.state.identities[key];
    const meta = group.value?.groupMembers?.[key] || { nickname: '', title: '', level: 1, admin: false, muted: false };
    return {
      key,
      name:
        key === 'user'
          ? phone.state.moments.profile.nickname || SillyTavern.name1 || '我'
          : identity?.name || '已移除成员',
      avatar: key === 'user' ? props.userAvatar || phone.state.moments.profile.avatar : identity?.avatar || '',
      meta,
      role: key === ownerKey.value ? '群主' : meta.admin ? '管理员' : '成员',
    };
  });
});
const avatarOpen = ref(false);
const editing = ref('');
const editorDialog = ref<HTMLElement | null>(null);
const editedMember = computed(() => members.value.find(item => item.key === editing.value));
const memberDraft = ref({ nickname: '', title: '', admin: false, muted: false });
const error = ref('');
function saveAvatar(value: { avatar: string; zoom: number; offsetX: number; offsetY: number }) {
  phone.updateActiveIdentityProfile({
    avatar: value.avatar,
    avatarZoom: value.zoom,
    avatarOffsetX: value.offsetX,
    avatarOffsetY: value.offsetY,
  });
  avatarOpen.value = false;
}
function updateName(event: Event) {
  phone.updateGroupDetails({ name: (event.target as HTMLInputElement).value });
}
function updateAnnouncement(event: Event) {
  phone.updateGroupDetails({ announcement: (event.target as HTMLTextAreaElement).value });
}
async function editMember(key: string) {
  const member = members.value.find(item => item.key === key);
  if (!member) return;
  memberDraft.value = {
    nickname: member.meta.nickname,
    title: member.meta.title,
    admin: member.meta.admin,
    muted: member.meta.muted,
  };
  error.value = '';
  editing.value = key;
  await nextTick();
  editorDialog.value?.focus();
}
function saveMember() {
  try {
    phone.updateGroupMember(editing.value, {
      nickname: memberDraft.value.nickname,
      title: memberDraft.value.title,
      ...(isOwner.value && editing.value !== ownerKey.value ? { admin: memberDraft.value.admin } : {}),
      ...(editing.value !== ownerKey.value ? { muted: memberDraft.value.muted } : {}),
    });
    editing.value = '';
  } catch (cause) {
    error.value = String(cause);
  }
}
function transferOwner() {
  if (!confirm(`确认将群主转让给 ${editedMember.value?.name}？`)) return;
  try {
    phone.updateGroupMember(editing.value, { transferOwner: true });
    editing.value = '';
  } catch (cause) {
    error.value = String(cause);
  }
}
function removeMember() {
  if (!confirm(`确认将 ${editedMember.value?.name} 移出群聊？`)) return;
  try {
    phone.updateGroupMember(editing.value, { remove: true });
    editing.value = '';
  } catch (cause) {
    error.value = String(cause);
  }
}
</script>
<style lang="scss">
#wave-phone-script-root .wave-device .wave-group-settings {
  .group-avatar-readonly {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    overflow: hidden;
    border-radius: 18px;
    background: var(--settings-control);
    color: var(--settings-accent);
    font-size: 24px;
  }
  .group-avatar-readonly img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .group-member-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    border-top: 1px solid var(--settings-line);
  }
  .group-member-avatar {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    overflow: hidden;
    border-radius: 50%;
    background: var(--settings-control);
    color: var(--settings-accent);
  }
  .group-member-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .group-member-copy {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }
  .group-member-copy strong {
    font-size: 13px;
    color: var(--settings-text);
  }
  .group-member-copy small {
    font-size: 11px;
    color: var(--settings-muted);
  }
  .group-member-edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 34px;
    min-width: 0;
    min-height: 0;
    margin: 0;
    padding: 0;
    line-height: 1;
    font-size: 13px;
    i {
      display: block;
      margin: 0;
      line-height: 1;
    }
    width: 34px;
    height: 34px;
    border: 1px solid var(--settings-line);
    border-radius: 10px;
    background: var(--settings-control);
    color: var(--settings-accent);
  }
}
#wave-phone-script-root .wave-device .group-edit-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(20, 33, 57, 0.36);
}
#wave-phone-script-root .wave-device .group-edit-overlay .group-edit-dialog {
  width: min(100%, 380px);
  max-height: 100%;
  min-width: 0;
  margin: 0;
  overscroll-behavior: contain;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 18px;
}
#wave-phone-script-root .wave-device .group-edit-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 16px 0 0;
  margin-top: 12px;
  border-top: 1px solid var(--settings-line);
}
#wave-phone-script-root .wave-device .group-edit-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  min-height: 0;
  min-width: 0;
  margin: 0;
  padding: 0 12px;
  font-size: 14px;
  line-height: 1;
  border: 1px solid var(--settings-line);
  border-radius: 12px;
  background: var(--settings-control);
  color: var(--settings-text);
}
#wave-phone-script-root .wave-device .group-edit-actions .group-edit-primary {
  background: var(--wave-navy);
  color: #fff;
}
#wave-phone-script-root .wave-device .group-edit-link {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 40px;
  margin: 8px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--settings-line);
  border-radius: 10px;
  line-height: 1.4;
  background: transparent;
  color: var(--settings-accent);
  text-align: left;
  font-size: 13px;
}
#wave-phone-script-root .wave-device .group-edit-link.danger {
  color: #b94b53;
}
</style>
