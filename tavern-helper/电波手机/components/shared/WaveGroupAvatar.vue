<template>
  <span class="wave-group-avatar-grid" role="img" aria-label="群成员头像四宫格">
    <span v-for="(member, index) in cells" :key="member?.key || `empty-${index}`" class="wave-group-avatar-cell">
      <img
        v-if="member?.avatar && !failed[member.avatar]"
        :src="member.avatar"
        :style="member.style"
        alt=""
        @error="failed[member.avatar] = true"
      />
      <span v-else-if="member" class="wave-group-avatar-initial">{{ member.name.slice(0, 1) }}</span>
    </span>
  </span>
</template>
<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { Identity } from '../../schemas';
import { usePhoneStore } from '../../stores/phone';
import { identityAvatarStyle } from '../../services/core/avatar';
const props = defineProps<{ group: Identity; userAvatar?: string }>();
const phone = usePhoneStore();
const failed = reactive<Record<string, boolean>>({});
const cells = computed(() => {
  const keys = [
    'user',
    ...new Set(
      (props.group.memberKeys || []).filter(
        key => key !== 'user' && phone.state.identities[key]?.source !== 'local_group' && phone.state.identities[key],
      ),
    ),
  ].slice(0, 4);
  const members = keys.map(key => ({
    key,
    name:
      props.group.groupMembers?.[key]?.nickname ||
      (key === 'user'
        ? phone.state.moments.profile.nickname || SillyTavern.name1 || '我'
        : phone.state.identities[key].name),
    avatar:
      key === 'user'
        ? props.userAvatar || phone.state.moments.profile.avatar || ''
        : phone.state.identities[key].avatar,
    style: key === 'user' ? {} : identityAvatarStyle(phone.state.identities[key]),
  }));
  return Array.from({ length: 4 }, (_, index) => members[index] || null);
});
</script>
<style lang="scss">
#wave-phone-script-root .wave-device .wave-group-avatar-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  gap: 1px;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--settings-control, #e9edf4);
  border-radius: inherit;
  > .wave-group-avatar-cell {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: 0;
    background: var(--wave-tint, #edf2fa);
    container-type: inline-size;
    > img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      object-fit: cover;
    }
    > .wave-group-avatar-initial {
      color: var(--settings-accent, #5e80be);
      font: 500 55cqw/1 var(--wave-ui-font, sans-serif);
    }
  }
}
#wave-phone-script-root .wave-device .avatar-preview > .wave-group-avatar-grid {
  position: absolute;
  inset: 0;
}
</style>
