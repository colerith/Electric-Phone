<template>
  <section class="chat-settings-group module-generation-settings">
    <div class="wave-settings-title">每轮新增</div>
    <p class="chat-settings-note">手动生成与跟随聊天共用此设置。旧内容更新不占额度，设为 0 后只更新已有内容。</p>
    <div class="module-limit-field">
      <label :for="`wave-${app}-limit`"
        >{{ labels[app] }}<b>{{ prefs.maxNew }} 条</b></label
      >
      <WaveSlider
        :id="`wave-${app}-limit`"
        v-model="prefs.maxNew"
        :min="0"
        :max="5"
        :aria-label="`每轮新增${labels[app]}上限`"
        @update:model-value="save"
      />
      <small><span>不新增</span><span>最多 5 条</span></small>
    </div>
    <div v-if="app === 'memo'" class="module-limit-field">
      <label
        >涂鸦<b>{{ phone.settings.moduleSettings.memo.maxDoodles }} 张</b></label
      >
      <WaveSlider
        v-model="phone.settings.moduleSettings.memo.maxDoodles"
        :min="0"
        :max="5"
        aria-label="每轮新增涂鸦上限"
        @update:model-value="save"
      />
      <small><span>不新增</span><span>最多 5 张</span></small>
    </div>
  </section>
  <WaveBilingualSettings
    v-if="languagePrefs"
    :prefs="languagePrefs"
    @update="Object.assign(languagePrefs, $event)"
    @save="save"
  />
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import type { LimitedApp } from '../../services/generation/module-settings';
import WaveSlider from '../shared/WaveSlider.vue';
import WaveBilingualSettings from '../shared/WaveBilingualSettings.vue';
const props = defineProps<{ app: LimitedApp }>();
const phone = usePhoneStore();
const labels = { memo: '便签', zone: '空间动态', calendar: '日程', browse: '浏览手记' };
const prefs = computed(() => phone.settings.moduleSettings[props.app]);
const languagePrefs = computed(() => (props.app === 'calendar' ? null : phone.settings.moduleSettings[props.app]));
function save(): void {
  phone.saveSettings();
}
</script>
<style scoped>
.module-generation-settings {
  margin-block: 0 20px;
}
.module-limit-field {
  padding: 20px 0 8px;
}
.module-limit-field + .module-limit-field {
  margin-top: 12px;
  border-top: 1px solid #e7e8ec;
}
.module-limit-field label,
.module-limit-field small {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.module-limit-field label {
  margin-bottom: 18px;
  color: #41444b;
}
.module-limit-field b {
  color: #5e80be;
  font-variant-numeric: tabular-nums;
}
.module-limit-field small {
  color: #91939a;
  margin-top: 12px;
  font-size: 12px;
}
</style>
