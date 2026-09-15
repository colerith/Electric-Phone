<template>
  <section class="settings-card system-settings-card generation-settings">
    <div class="wave-settings-title">内容生成</div>
    <p>跟随酒馆生成正文，按下面两组规则更新手机内容。各 App 的手动生成入口保持独立。</p>
    <div class="system-toggle-row">
      <span>跟随酒馆生成</span
      ><WaveToggle v-model="phone.settings.generation.followEnabled" aria-label="跟随酒馆生成" />
    </div>
    <template v-if="phone.settings.generation.followEnabled">
      <div v-for="group in groups" :key="group.id" class="generation-module-group">
        <div class="generation-group-heading">
          <strong>{{ group.label }}</strong
          ><span>已选 {{ selected(group.id).length }}</span>
        </div>
        <p>{{ group.help }}</p>
        <div class="generation-module-grid" role="group" :aria-label="group.label">
          <button
            v-for="item in options"
            :key="item.value"
            type="button"
            :aria-pressed="selected(group.id).includes(item.value)"
            @click="toggleModule(group.id, item.value)"
          >
            <span>{{ item.label }}</span
            ><i
              :class="selected(group.id).includes(item.value) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'"
              aria-hidden="true"
            ></i>
          </button>
        </div>
        <div class="generation-selection-summary">
          {{
            selected(group.id).length
              ? selected(group.id)
                  .map(id => MODULE_LABELS[id])
                  .join(' · ')
              : '暂未选择模块'
          }}
        </div>
      </div>
      <div v-for="field in ['randomMin', 'randomMax'] as const" :key="field" class="settings-slider-row">
        <span
          ><strong>{{ field === 'randomMin' ? '随机更新数量下限' : '随机更新数量上限' }}</strong
          ><b>{{ phone.settings.generation[field] }} 个</b></span
        >
        <WaveSlider
          v-model="phone.settings.generation[field]"
          :min="field === 'randomMax' ? 2 : 1"
          :max="4"
          :step="1"
          :aria-label="field === 'randomMin' ? '随机更新数量下限' : '随机更新数量上限'"
          @update:model-value="
            value => {
              if (field === 'randomMin')
                phone.settings.generation.randomMax = Math.max(value, phone.settings.generation.randomMax);
              else phone.settings.generation.randomMin = Math.min(value, phone.settings.generation.randomMin);
            }
          "
        />
      </div>
      <div class="settings-slider-row">
        <span
          ><strong>随机组每轮激活概率</strong><small>命中后按数量范围随机选择模块，不影响必更新组</small
          ><b>{{ phone.settings.generation.probability }}%</b></span
        ><WaveSlider
          v-model="phone.settings.generation.probability"
          :min="0"
          :max="100"
          :step="5"
          aria-label="随机组每轮激活概率"
        />
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { usePhoneStore } from '../stores/phone';
import { APP_IDS, type AppId } from '../schemas';
import { MODULE_LABELS } from '../services/module-protocol';
import WaveToggle from './WaveToggle.vue';
import WaveSlider from './WaveSlider.vue';
const phone = usePhoneStore();
type Group = 'requiredModules' | 'modules';
const groups: { id: Group; label: string; help: string }[] = [
  { id: 'requiredModules', label: '每轮必更新', help: '每轮都检查这些模块；没有新事实时保留原内容。' },
  { id: 'modules', label: '每轮随机更新', help: '按概率随机激活指定数量的模块。选入另一组时会自动移出本组。' },
];
const options = APP_IDS.map(value => ({ value, label: MODULE_LABELS[value] }));
function selected(group: Group) {
  return phone.settings.generation[group];
}
function toggleModule(group: Group, id: AppId) {
  const settings = phone.settings.generation;
  settings[group] = settings[group].includes(id)
    ? settings[group].filter(value => value !== id)
    : [...settings[group], id];
  const other = group === 'modules' ? 'requiredModules' : 'modules';
  if (settings[group].includes(id)) settings[other] = settings[other].filter(value => value !== id);
}
</script>
