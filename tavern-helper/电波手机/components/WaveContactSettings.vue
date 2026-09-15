<template>
  <section v-if="phone.activeIdentity?.source !== 'local_group'" class="chat-settings-group contact-settings">
    <div class="wave-settings-title">聊天对象</div>
    <label class="chat-setting-row"
      ><span>对象类型</span
      ><WaveSelect
        v-model="draft.actorType"
        :options="[
          { value: 'main', label: '主要角色' },
          { value: 'npc', label: 'NPC' },
        ]"
        aria-label="聊天对象类型"
    /></label>
    <label class="chat-setting-block"
      >与我的关系<input
        v-model="draft.relationshipToUser"
        maxlength="160"
        placeholder="填写关系，或选择下方参考项"
        aria-label="与我的关系"
    /></label>
    <div class="contact-relationship-options">
      <button
        v-for="name in relationships"
        :key="name"
        type="button"
        :aria-pressed="draft.relationshipToUser === name"
        @click="draft.relationshipToUser = name"
      >
        {{ name }}
      </button>
    </div>
    <label v-if="draft.actorType === 'npc'" class="chat-setting-block"
      >NPC 人设<textarea
        v-model="draft.npcProfile"
        rows="6"
        maxlength="10000"
        placeholder="身份、经历、性格、说话方式，以及与我的关系…"
        aria-label="NPC 人设"
      />
    </label>
    <p class="chat-settings-note">关系与备注独立保存；NPC 人设用于私聊和朋友圈，头像可在上方修改。</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { usePhoneStore } from '../stores/phone';
import WaveSelect from './WaveSelect.vue';
const phone = usePhoneStore(),
  error = ref(''),
  draft = ref<{ actorType: 'main' | 'npc'; relationshipToUser: string; npcProfile: string }>({
    actorType: 'main',
    relationshipToUser: '',
    npcProfile: '',
  });
const relationships = ['恋人', '朋友', '闺蜜', '亲人', '同事', '陌生人'];
watch(
  () => phone.state.activeCharKey,
  () => {
    const identity = phone.activeIdentity;
    draft.value = {
      actorType: identity?.actorType || 'main',
      relationshipToUser: identity?.relationshipToUser || '',
      npcProfile: identity?.npcProfile || identity?.about || '',
    };
    error.value = '';
  },
  { immediate: true },
);
function save(): boolean {
  try {
    phone.setContactDetails({ ...draft.value, relationshipToUser: draft.value.relationshipToUser.trim() });
    error.value = '';
    return true;
  } catch (e) {
    error.value = String(e);
    return false;
  }
}
defineExpose({ save });
</script>
