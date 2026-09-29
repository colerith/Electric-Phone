<template>
  <WaveSelect
    class="wave-character-switch"
    :model-value="phone.state.activeCharKey"
    :options="options"
    :disabled="!options.length"
    :aria-label="
      options.length
        ? `切换主要角色，当前${phone.activeIdentity?.name || '未选择'}`
        : '暂无主要角色，请在私聊设置中添加'
    "
    @update:model-value="phone.selectPanelCharacter"
  >
    <template #leading>
      <span class="panel-character-avatar">
        <img
          v-if="avatar(phone.state.activeCharKey)"
          :src="avatar(phone.state.activeCharKey)"
          :style="crop(phone.state.activeCharKey)"
          alt=""
          @error="failed[phone.state.activeCharKey] = true"
        />
        <i v-else class="fa-solid fa-user"></i>
      </span>
    </template>
    <template #option-leading="{ option }">
      <span class="panel-character-avatar">
        <img
          v-if="avatar(option.value)"
          :src="avatar(option.value)"
          :style="crop(option.value)"
          alt=""
          @error="failed[option.value] = true"
        />
        <i v-else class="fa-solid fa-user"></i>
      </span>
    </template>
  </WaveSelect>
</template>
<script setup lang="ts">
import { computed, reactive } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { displayIdentityName } from '../../services/core/identity';
import WaveSelect from './WaveSelect.vue';
const phone = usePhoneStore();
const failed = reactive<Record<string, boolean>>({});
const options = computed(() =>
  phone.panelCharacters.map(identity => ({ value: identity.charKey, label: displayIdentityName(identity) })),
);
function avatar(key: string): string {
  return failed[key] ? '' : phone.state.identities[key]?.avatar || '';
}
function crop(key: string): Record<string, string> {
  const identity = phone.state.identities[key];
  if (!identity) return {};
  const maximum = Math.max(0, (identity.avatarZoom - 1) * 50);
  return {
    transform: `translate(${_.clamp(identity.avatarOffsetX * 0.32, -maximum, maximum)}%, ${_.clamp(identity.avatarOffsetY * 0.32, -maximum, maximum)}%) scale(${identity.avatarZoom})`,
  };
}
</script>
<style lang="scss">
#wave-phone-script-root .wave-device .wave-character-switch {
  flex: 0 0 38px;
  width: 38px;
  > .wave-select-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--wave-card, #fff);
    > span:not(.panel-character-avatar),
    > i {
      display: none;
    }
  }
  .panel-character-avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    overflow: hidden;
    border-radius: 50%;
    background: var(--settings-control, #f3f3f3);
    color: var(--settings-accent, #5e80be);
    img {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
      object-fit: cover;
      border-radius: 0;
    }
    i {
      font-size: 15px;
      line-height: 1;
    }
  }
  > .wave-select-menu {
    left: auto;
    right: 0;
    width: min(220px, 65vw);
    min-width: 0;
    [role='option'] {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      height: auto;
      border-radius: 10px;
      text-align: left;
    }
    [role='option'] strong {
      font: 500 14px/1.5 var(--wave-ui-font, sans-serif) !important;
      letter-spacing: 0;
    }
    [role='option'] > span:not(.panel-character-avatar) {
      min-width: 0;
      flex: 1;
      overflow-wrap: anywhere;
    }
  }
}
</style>
