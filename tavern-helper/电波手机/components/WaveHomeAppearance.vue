<template>
  <div class="home-appearance-editor">
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">顶部状态栏</div>
      <div class="system-toggle-row">
        <span><strong>显示状态栏信息</strong><small>显示左侧时间，以及右侧信号、电量信息</small></span>
        <WaveToggle v-model="appearance.showStatusBar" aria-label="显示状态栏信息" />
      </div>
      <p>此开关不会隐藏中间的灵动岛。</p>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">Ecot 内容</div>
      <div class="system-toggle-row appearance-ecot-toggle">
        <span><strong>显示 Ecot</strong><small>以折叠形式查看模型附带的剧情辅助信息</small></span>
        <WaveToggle v-model="showElectric" aria-label="显示 Ecot 内容" />
      </div>
      <p>Ecot 不是预览。手机内仅会在消息页显示；关闭后，手机与酒馆楼层都会完全隐藏。</p>
    </section>
    <section class="settings-card appearance-group">
      <div class="wave-settings-title">纪念日</div>
      <p id="wave-anniversary-help">为当前角色设置故事开始的日期</p>
      <label class="appearance-date-field">
        <span>纪念日起始日期</span>
        <input
          id="wave-anniversary-date"
          v-model="appearance.anniversaries[cardKey]"
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
import { computed, ref } from 'vue';
import { usePhoneStore } from '../stores/phone';
import WaveToggle from './WaveToggle.vue';
import { presetIcon } from '../preset-icon';
import { appIcons } from '../app-icons';
import WaveImageUpload from './WaveImageUpload.vue';
const props = defineProps<{ apps: Array<{ id: string; name: string }> }>();
const phone = usePhoneStore();
const appearance = computed(() => phone.settings.appearance);
const showElectric = computed({
  get: () => !appearance.value.hideElectric,
  set: value => (appearance.value.hideElectric = !value),
});
const cardKey = computed(() => phone.context?.cardKey || '');
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
