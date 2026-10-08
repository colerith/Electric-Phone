<template>
  <div class="home-appearance-editor">
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">打开入口方式</div>
      <p>可同时开启多个入口；默认只显示快速回复栏按钮。</p>
      <div class="system-toggle-row">
        <span><strong>悬浮球</strong><small>可拖动，贴边隐藏三分之一，保留三分之二可见</small></span>
        <WaveToggle
          v-model="appearance.floatingEntry"
          aria-label="显示电波手机悬浮球"
          :disabled="appearance.floatingEntry && !appearance.quickReplyEntry"
          @update:model-value="phone.saveSettings()"
        />
      </div>
      <div class="system-toggle-row">
        <span
          ><strong>{{ isExtensionRuntime ? '扩展菜单入口' : '注入快速回复栏' }}</strong
          ><small>{{
            isExtensionRuntime
              ? '在酒馆扩展菜单中显示电波手机；扩展设置中始终保留入口'
              : '显示酒馆助手的「📱 电波手机」脚本按钮'
          }}</small></span
        >
        <WaveToggle
          v-model="appearance.quickReplyEntry"
          aria-label="注入快速回复栏"
          :disabled="appearance.quickReplyEntry && !appearance.floatingEntry"
          @update:model-value="phone.saveSettings()"
        />
      </div>
      <p>修改立即生效并自动保存。至少保留一个入口；悬浮球使用内置图标，打开手机时暂时隐藏。</p>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">顶部状态栏</div>
      <div class="system-toggle-row">
        <span><strong>显示状态栏信息</strong><small>显示左侧时间，以及右侧信号、电量信息</small></span>
        <WaveToggle v-model="appearance.showStatusBar" aria-label="显示状态栏信息" />
      </div>
      <p>此开关不会隐藏中间的灵动岛。</p>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">底部小白条</div>
      <div class="settings-slider-row">
        <span
          ><strong>底部栏高度</strong><small>调整小白条所在区域的高度，背景随页面保持沉浸</small
          ><b>{{ appearance.homeBarHeight }} px</b></span
        >
        <WaveSlider v-model="appearance.homeBarHeight" :min="16" :max="64" :step="2" aria-label="底部小白条区域高度" />
      </div>
      <div class="settings-actions appearance-height-actions">
        <button
          type="button"
          class="system-action settings-refresh-action appearance-reset-height"
          @click="appearance.homeBarHeight = 40"
        >
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>恢复默认高度</span>
        </button>
      </div>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">Ecot 内容</div>
      <div class="system-toggle-row appearance-ecot-toggle">
        <span><strong>显示 Ecot</strong><small>以折叠形式查看模型附带的剧情辅助信息</small></span>
        <WaveToggle v-model="showElectric" aria-label="显示 Ecot 内容" />
      </div>
      <p>Ecot 不是预览。此开关只控制手机消息与应用中的折叠内容，不改动酒馆正文楼层。</p>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">纪念日</div>
      <p id="wave-anniversary-help">选择主要角色，绑定纪念日与主屏显示的头像。</p>
      <label class="appearance-date-field">
        <span>绑定角色</span>
        <WaveSelect
          v-model="boundCharacter"
          :options="anniversaryOptions"
          :disabled="!anniversaryOptions.length"
          aria-label="纪念日绑定角色"
        />
      </label>
      <p v-if="!anniversaryOptions.length">暂无主要角色，可在联系人设置中将角色类型设为“主要角色”。</p>
      <label class="appearance-date-field">
        <span>纪念日起始日期</span>
        <input
          id="wave-anniversary-date"
          v-model="anniversaryDate"
          :disabled="!boundCharacter"
          type="date"
          aria-label="纪念日起始日期"
          aria-describedby="wave-anniversary-help"
        />
      </label>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">主屏与桌面壁纸</div>
      <p>主屏是角色封面页，桌面是应用列表页。</p>
      <div v-for="item in wallpapers" :key="item.id" class="appearance-wallpaper-row">
        <div class="appearance-wallpaper-preview">
          <img v-if="wallpaperValue(item.id)" :src="wallpaperValue(item.id)" :alt="item.name" /><i
            v-else
            class="fa-regular fa-image"
          ></i>
        </div>
        <strong>{{ item.name }}</strong
        ><button type="button" @click="editing = item.id">修改壁纸</button>
      </div>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">应用图标与名称</div>
      <p>自定义桌面与 Dock 图标；还原可恢复该应用的默认图标和名称。</p>
      <div v-for="app in editableApps" :key="app.id" class="appearance-icon-row">
        <img :src="appearance.iconImages[app.id] || (app.id === 'presets' ? presetIcon : appIcons[app.id])" alt="" />
        <label
          ><span>{{ app.name }}名称</span
          ><input v-model="appearance.iconNames[app.id]" :placeholder="app.name" :aria-label="`${app.name}图标名称`"
        /></label>
        <button type="button" @click="editing = app.id">替换图标</button>
        <button
          type="button"
          @click="
            delete appearance.iconImages[app.id];
            delete appearance.iconNames[app.id];
          "
        >
          还原
        </button>
      </div>
    </section>
    <template v-if="editing">
      <WaveImageUpload
        :key="editing"
        inline
        purpose="artwork"
        :model-value="editingValue"
        :label="editingLabel"
        @cancel="editing = ''"
        @confirm="applyImage"
        @reset="applyImage({ avatar: '' })"
      />
    </template>
  </div>
</template>
<script setup lang="ts">
import { isExtensionRuntime } from '../../services/core/runtime';
import { computed, ref } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveSlider from '../shared/WaveSlider.vue';
import WaveSelect from '../shared/WaveSelect.vue';
import {
  mainAnniversaryCharacters,
  resolveAnniversaryCharacter,
  anniversaryDateFor,
} from '../../services/core/anniversary';
import { displayIdentityName } from '../../services/core/identity';
import { presetIcon } from '../../assets/icons/preset-icon';
import { appIcons } from '../../assets/icons/app-icons';
import WaveImageUpload from '../shared/WaveImageUpload.vue';
const props = defineProps<{ apps: Array<{ id: string; name: string }> }>();
const phone = usePhoneStore();
const appearance = computed(() => phone.settings.appearance);
const showElectric = computed({
  get: () => !appearance.value.hideElectric,
  set: value => (appearance.value.hideElectric = !value),
});
const cardKey = computed(() => phone.context?.cardKey || '');
const anniversaryOptions = computed(() =>
  mainAnniversaryCharacters(phone.identities).map(identity => ({
    value: identity.charKey,
    label: displayIdentityName(identity),
  })),
);
const boundCharacter = computed({
  get: () =>
    resolveAnniversaryCharacter(
      phone.identities,
      appearance.value.anniversaryBindings[cardKey.value],
      phone.state.activeCharKey,
    )?.charKey || '',
  set: key => {
    const previous = boundCharacter.value;
    const legacy = appearance.value.anniversaries[cardKey.value];
    if (!appearance.value.anniversaryBindings[cardKey.value] && previous && legacy)
      appearance.value.anniversaryDates[`${cardKey.value}::${previous}`] ||= legacy;
    appearance.value.anniversaryBindings[cardKey.value] = key;
  },
});
const anniversaryDate = computed({
  get: () => anniversaryDateFor(appearance.value, cardKey.value, boundCharacter.value),
  set: date => {
    if (!boundCharacter.value) return;
    appearance.value.anniversaryDates[`${cardKey.value}::${boundCharacter.value}`] = date;
    appearance.value.anniversaryBindings[cardKey.value] = boundCharacter.value;
  },
});
const editableApps = computed(() => [
  ...props.apps,
  { id: 'settings', name: '设置' },
  { id: 'appearance', name: '外观' },
  { id: 'twitter', name: '推特' },
  { id: 'presets', name: '预设' },
]);
const wallpapers = [
  { id: 'coverWallpaper', name: '主屏壁纸' },
  { id: 'desktopWallpaper', name: '桌面壁纸' },
];
function wallpaperValue(id: string) {
  return id === 'coverWallpaper'
    ? appearance.value.coverWallpaper || phone.context?.avatar || ''
    : appearance.value.desktopWallpaper;
}
const editing = ref('');
const editingLabel = computed(() => wallpapers.find(item => item.id === editing.value)?.name || '应用图标');
const editingValue = computed(() =>
  editing.value === 'coverWallpaper'
    ? appearance.value.coverWallpaper
    : editing.value === 'desktopWallpaper'
      ? appearance.value.desktopWallpaper
      : appearance.value.iconImages[editing.value] || '',
);
function applyImage(value: { avatar: string }) {
  if (editing.value === 'coverWallpaper' || editing.value === 'desktopWallpaper')
    appearance.value[editing.value] = value.avatar;
  else appearance.value.iconImages[editing.value] = value.avatar;
  editing.value = '';
}
</script>
