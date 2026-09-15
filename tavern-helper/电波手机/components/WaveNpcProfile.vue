<template>
  <section v-if="npc" class="npc-profile-page">
    <div class="npc-profile-hero">
      <div class="npc-profile-avatar">
        <img v-if="!broken" :src="avatar" alt="" @error="broken = true" /><span v-else>{{
          npc.username.slice(0, 1)
        }}</span>
      </div>
      <div>
        <h3>{{ npc.username }}</h3>
        <p>账号：{{ npc.avatarSeed.replace('wave-', 'wave_') }}</p>
        <small>{{ contact ? '通讯录好友' : '来自朋友圈' }}</small>
      </div>
    </div>
    <section class="settings-card system-settings-card moments-form">
      <div class="npc-profile-row">
        <span>关系</span><b>{{ contact?.relationshipToUser || '尚未添加好友' }}</b>
      </div>
      <div class="npc-profile-about">
        <span>个人介绍</span>
        <p>{{ contact?.npcProfile || npc.profile || '这位朋友还没有留下介绍。' }}</p>
      </div>
    </section>
    <button class="settings-save-wide" type="button" @click="act">{{ contact ? '发消息' : '添加到通讯录' }}</button>
    <p v-if="notice" role="status" class="chat-settings-note">{{ notice }}</p>
    <p class="chat-settings-note">
      {{ contact ? '头像、关系与人设可在私聊设置里修改。' : '添加后可在联系人列表找到这位朋友。' }}
    </p>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePhoneStore } from '../stores/phone';
import { npcAvatarUrl } from '../services/npc-avatar';
const props = defineProps<{ npcId: string }>();
const phone = usePhoneStore(),
  broken = ref(false),
  notice = ref('');
const npc = computed(() => phone.state.moments.npcs[props.npcId]);
const contact = computed(() => phone.state.identities[props.npcId]);
const avatar = computed(() => contact.value?.avatar || npcAvatarUrl(npc.value?.avatarSeed || 'wave'));
watch(avatar, () => {
  broken.value = false;
});
function act(): void {
  try {
    if (contact.value) {
      phone.startConversation(props.npcId);
      phone.currentPage = 'conversation';
    } else {
      phone.addMomentNpc(props.npcId);
      notice.value = '已添加到通讯录';
    }
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
  }
}
</script>
<style scoped>
.npc-profile-page {
  padding: 24px 18px;
  color: var(--wave-ink, #374558);
}
.npc-profile-hero {
  display: flex;
  gap: 18px;
  align-items: center;
  margin: 8px 0 26px;
}
.npc-profile-hero > div:last-child {
  min-width: 0;
}
.npc-profile-hero h3 {
  margin: 0 0 8px;
  font-size: 20px;
}
.npc-profile-hero p {
  overflow-wrap: anywhere;
  font-size: 12px;
  color: #888b94;
}
.npc-profile-hero small {
  color: #888b94;
}
.npc-profile-avatar {
  width: 76px;
  height: 76px;
  flex: 0 0 76px;
  overflow: hidden;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: #f3f3f3;
}
.npc-profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.npc-profile-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e4e4e7;
}
.npc-profile-row b {
  font-weight: 500;
}
.npc-profile-about {
  padding-top: 16px;
}
.npc-profile-about p {
  white-space: pre-wrap;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
</style>
