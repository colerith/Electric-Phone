<template>
  <section class="settings-card system-settings-card">
    <div class="wave-settings-title">API</div>
    <label>
      <strong>生成方式</strong>
      <WaveSelect
        :model-value="selection.mode"
        :options="modes"
        aria-label="此应用的 API"
        @update:model-value="setMode"
      />
    </label>
    <label v-if="selection.mode === 'profile'">
      <strong>副 API 预设</strong>
      <WaveSelect
        :model-value="selection.profileId"
        :options="profiles"
        aria-label="此应用的副 API 预设"
        @update:model-value="setProfile"
      />
    </label>
    <p v-if="selection.mode === 'profile' && !phone.settings.apiProfiles.length">
      还没有已保存的预设，请先在全局「API 连接」中保存配置。
    </p>
    <p v-else-if="selection.mode === 'profile' && !profileExists">
      请选择一个有效的副 API 预设；原预设删除后不会自动改用其他接口。
    </p>
    <p>跟随酒馆时随正文生成；使用副 API 时等正文最终完成再更新。手动生成也使用这里选择的 API。</p>
    <p v-if="['music', 'calendar', 'browse'].includes(app)">仅影响 AI 生成，不改变音乐、天气和网页服务。</p>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { AppId, ScriptSettings } from '../../schemas';
import { usePhoneStore } from '../../stores/phone';
import WaveSelect from '../shared/WaveSelect.vue';
const props = defineProps<{ app: AppId }>();
const phone = usePhoneStore();
const selection = computed(
  () => phone.settings.generation.appApis[props.app] || { mode: 'inherit' as const, profileId: '' },
);
const modes = [
  { value: 'inherit', label: '跟随全局设置', description: '使用内容生成页的统一选择' },
  { value: 'main_api', label: '跟随酒馆', description: '使用酒馆主 API' },
  { value: 'secondary_api', label: '跟随副 API', description: '使用全局当前副 API 配置' },
  { value: 'profile', label: '单独设置', description: '从已保存的副 API 预设中选择' },
];
const profileExists = computed(() => phone.settings.apiProfiles.some(item => item.id === selection.value.profileId));
const profiles = computed(() => [
  { value: '', label: '请选择预设' },
  ...(!profileExists.value && selection.value.profileId
    ? [{ value: selection.value.profileId, label: '原预设已删除，请重新选择' }]
    : []),
  ...phone.settings.apiProfiles.map(item => ({
    value: item.id,
    label: item.name,
    description: item.api.model || '尚未配置模型',
  })),
]);
function setMode(mode: string) {
  phone.settings.generation.appApis[props.app] = {
    ...selection.value,
    mode: mode as NonNullable<ScriptSettings['generation']['appApis'][AppId]>['mode'],
  };
  phone.saveSettings();
}
function setProfile(profileId: string) {
  phone.settings.generation.appApis[props.app] = { ...selection.value, profileId };
  phone.saveSettings();
}
</script>
