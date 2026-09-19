<template>
  <section class="wave-app-content app-function-settings wave-settings-surface">
    <WaveWalletWorkspace v-if="app === 'wallet'" mode="settings" />
    <WaveModuleSettings v-if="isLimitedApp(app)" :app="app" />
    <template v-if="app === 'conversation'">
      <section v-if="phone.activeIdentity" class="chat-settings-group chat-profile-settings">
        <div class="wave-settings-title">{{ phone.activeIdentity.name }}</div>
        <WaveImageUpload
          :inline="avatarOpen"
          :model-value="phone.activeIdentity.avatar"
          :fallback="phone.context?.avatar || ''"
          label="头像"
          :zoom="phone.activeIdentity.avatarZoom"
          :offset-x="phone.activeIdentity.avatarOffsetX"
          :offset-y="phone.activeIdentity.avatarOffsetY"
          :max-side="phone.settings.media.imageMaxSide"
          :quality="phone.settings.media.imageQuality"
          @cancel="avatarOpen = false"
          @confirm="saveAvatar"
          @reset="
            phone.updateActiveIdentityProfile({ resetAvatar: true });
            avatarOpen = false;
          "
        />
        <label class="chat-setting-block"
          >备注<input
            :value="phone.activeIdentity.remark"
            maxlength="240"
            placeholder="为这个角色设置备注"
            @change="phone.updateActiveIdentityProfile({ remark: ($event.target as HTMLInputElement).value })"
        /></label>
      </section>
      <WaveChatPreferences ref="chatPreferences" />
    </template>
    <section
      v-if="app === 'zone' || app === 'wallet'"
      class="chat-settings-group system-settings-card cover-settings-card"
    >
      <div class="wave-settings-title">
        <b>{{ app === 'zone' ? '空间封面' : '银行卡面' }}</b
        ><small>外观图库</small>
      </div>
      <div class="artwork-options">
        <button type="button" :aria-pressed="!artwork" @click="$emit('artwork', '')">
          <span class="default-artwork"></span><b>柔光渐变</b>
        </button>
        <button
          v-for="item in app === 'zone' ? zoneArtworks : walletArtworks"
          :key="item.id"
          type="button"
          :aria-pressed="artwork === item.id"
          @click="$emit('artwork', item.id)"
        >
          <img :src="item.url" alt="" /><b>{{ item.name }}</b>
        </button>
      </div>
      <button class="function-setting-row" type="button" @click="uploadOpen = !uploadOpen">
        <i class="fa-regular fa-image"></i><span><strong>自定义图片</strong><small>粘贴图链或上传本地图片</small></span
        ><i class="fa-solid fa-chevron-right"></i>
      </button>
      <WaveImageUpload
        v-if="uploadOpen"
        :key="artwork"
        inline
        purpose="artwork"
        :model-value="artworkUrl(artwork)"
        :label="app === 'zone' ? '空间封面' : '银行卡面'"
        @cancel="uploadOpen = false"
        @confirm="saveImage"
        @reset="
          $emit('artwork', '');
          uploadOpen = false;
        "
      />
    </section>
    <WaveMoments
      v-if="app === 'zone'"
      view="me"
      context="space"
      initial-panel="settings"
      :user-name="phone.state.moments.profile.nickname || '我'"
      :user-avatar="phone.state.moments.profile.avatar"
    />
    <div v-if="app === 'browse'" class="browser-preferences">
      <div class="function-section-heading"><b>搜索引擎</b><small>真实网页搜索</small></div>
      <WaveSelect
        :model-value="searchEngine"
        :options="[
          { value: 'google', label: 'Google' },
          { value: 'bing', label: 'Bing' },
          { value: 'duckduckgo', label: 'DuckDuckGo' },
        ]"
        aria-label="默认搜索引擎"
        @update:model-value="value => $emit('engine', value as SearchEngine)"
      />
      <label class="service-preference"
        >手机内搜索接口<input
          :value="browserEndpoint"
          type="url"
          placeholder="SearXNG /search 地址（可留空）"
          @change="$emit('service', 'browserEndpoint', ($event.target as HTMLInputElement).value)"
        /><small>留空使用维基百科；网页搜索需填写启用 JSON 与跨域访问的 SearXNG 地址。</small></label
      >
      <button class="function-setting-row" type="button" @click="$emit('clear-history')">
        <i class="fa-solid fa-clock-rotate-left"></i
        ><span><strong>清空历史记录</strong><small>保留网页收藏夹</small></span>
      </button>
    </div>
    <div v-if="app === 'music'" class="browser-preferences">
      <label class="service-preference settings-toggle-field"
        ><span>使用推荐服务的登录态</span
        ><WaveToggle
          v-model="phone.settings.musicPersonalized"
          aria-label="个性化日推"
          @update:model-value="phone.saveSettings()"
        /><small>开启前先在所填服务登录；服务需允许携带登录凭据跨域。关闭时显示公开新歌精选。</small></label
      >
      <label class="service-preference"
        >网易云推荐与歌词服务<input
          v-model="phone.settings.neteaseApi"
          type="url"
          @change="phone.saveSettings()"
        /><small>NeteaseCloudMusicApi 兼容地址；登录态由服务端管理。</small></label
      >
      <label class="service-preference"
        >QQ 推荐与歌词服务<input
          v-model="phone.settings.qqMusicApi"
          type="url"
          placeholder="QQMusicApi 兼容地址"
          @change="phone.saveSettings()"
        /><small>支持 jsososo/QQMusicApi，服务需允许跨域。未登录时获取新歌精选。</small></label
      >
      <div class="function-section-heading"><b>音乐服务</b><small>搜索 · 封面 · 歌词</small></div>
      <WaveSelect
        :model-value="musicSource"
        :options="[
          { value: 'aggregate', label: '聚合搜索（默认）' },
          ...musicProviders.map(source => ({ value: source.id, label: source.label })),
          { value: 'netease', label: '自定义接口 · 网易云' },
          { value: 'tencent', label: '自定义接口 · QQ 音乐' },
        ]"
        @update:model-value="value => $emit('service', 'musicSource', value)"
      />
      <p v-if="musicSource === 'aggregate'" class="function-settings-footnote">
        依次查询 GDStudio 网易云、VKeys QQ、VKeys 网易云、Meting 酷狗，每源最多 5 首；单源失败自动跳过。
      </p>
      <label v-if="musicSource === 'netease' || musicSource === 'tencent'" class="service-preference"
        >音源接口<input
          :value="musicApi"
          type="url"
          placeholder="VKeys / GDStudio 兼容 API 地址"
          @change="$emit('service', 'musicApi', ($event.target as HTMLInputElement).value)"
        /><small>由音源返回可用版本、封面和歌词。不可用时可切换来源或兼容接口。</small></label
      >
    </div>
    <WaveCharacterVoice v-if="app === 'messages' || app === 'conversation'" />
    <WaveWeatherLocation
      v-if="app === 'calendar'"
      :location="weatherLocation"
      @select="value => $emit('location', value)"
    />
    <div class="function-section-heading"><b>通用偏好</b><small>适用于电波手机</small></div>
    <div class="function-settings-group">
      <button class="function-setting-row" type="button" @click="$emit('settings', 'appearance')">
        <i class="fa-solid fa-palette"></i><span><strong>显示与外观</strong><small>字体、字号与界面风格</small></span
        ><i class="fa-solid fa-chevron-right"></i>
      </button>
      <button class="function-setting-row" type="button" @click="$emit('settings', 'api')">
        <i class="fa-solid fa-link"></i><span><strong>AI 连接</strong><small>模型与服务配置</small></span
        ><i class="fa-solid fa-chevron-right"></i>
      </button>
      <button
        v-if="app === 'conversation'"
        class="function-setting-row"
        type="button"
        @click="$emit('settings', 'chat')"
      >
        <i class="fa-regular fa-comment"></i><span><strong>聊天与发送</strong><small>输入习惯与消息行为</small></span
        ><i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
    <section v-if="clearableApps.includes(app)" class="settings-card system-settings-card wave-clear-section">
      <div class="wave-settings-title">{{ app === 'zone' ? '角色空间内容' : '内容管理' }}</div>
      <p>清除当前角色在此应用中的全部内容，并阻止已删除的历史数据重新同步。</p>
      <button v-if="!clearConfirm" type="button" class="wave-clear-button" @click="clearConfirm = true">
        <i class="fa-regular fa-trash-can"></i>一键清空{{ name }}
      </button>
      <div v-else class="wave-clear-confirm">
        <span>确定清空？此操作无法撤销。</span><button type="button" @click="clearConfirm = false">取消</button
        ><button
          type="button"
          class="danger"
          @click="
            $emit('clear-app', app);
            clearConfirm = false;
          "
        >
          确认清空
        </button>
      </div>
    </section>
    <p v-if="app === 'zone'" class="function-settings-footnote">
      角色资料随故事更新；自选封面在同一角色卡的聊天之间共享。世界动态与匿名树洞内容按聊天保存。
    </p>
    <p v-if="app === 'wallet'" class="function-settings-footnote">
      同一角色卡的账户、余额、流水、币种和卡面在不同聊天之间共享。
    </p>
    <WaveChatCleanup v-if="app === 'conversation'" />
  </section>
</template>
<script setup lang="ts">
import WaveMoments from '../space/WaveMoments.vue';
import WaveWalletWorkspace from '../wallet/WaveWalletWorkspace.vue';
import WaveModuleSettings from './WaveModuleSettings.vue';
import { isLimitedApp } from '../../services/generation/module-updates';
import WaveChatCleanup from '../chat/WaveChatCleanup.vue';
import WaveChatPreferences from '../chat/WaveChatPreferences.vue';

import { ref } from 'vue';
import { musicProviders } from '../../services/music/music';
import { usePhoneStore } from '../../stores/phone';
import WaveCharacterVoice from '../chat/WaveCharacterVoice.vue';
const phone = usePhoneStore();
import WaveSelect from '../shared/WaveSelect.vue';
import WaveToggle from '../shared/WaveToggle.vue';
import type { SearchEngine } from '../../services/apps/browser';
import WaveImageUpload from '../shared/WaveImageUpload.vue';
import WaveWeatherLocation from './WaveWeatherLocation.vue';
import type { WeatherLocation } from '../../services/core/weather';
import { zoneArtworks, walletArtworks, artworkUrl } from '../../services/core/artworks';
defineProps<{
  app: string;
  name: string;
  artwork: string;
  weatherLocation: WeatherLocation | null;
  searchEngine: SearchEngine;
  browserEndpoint: string;
  musicApi: string;
  musicSource: string;
}>();
const emit = defineEmits<{
  engine: [value: SearchEngine];
  service: [key: 'browserEndpoint' | 'musicApi' | 'musicSource', value: string];
  'clear-history': [];
  location: [value: WeatherLocation | null];
  artwork: [value: string];
  settings: [section: 'appearance' | 'api' | 'chat'];
  'clear-app': [app: string];
}>();
const avatarOpen = ref(false);
const clearConfirm = ref(false);
const clearableApps = ['status', 'memo', 'zone', 'wallet', 'calendar', 'browse', 'music'];
function saveAvatar(value: { avatar: string; zoom: number; offsetX: number; offsetY: number }) {
  phone.updateActiveIdentityProfile({
    avatar: value.avatar,
    avatarZoom: value.zoom,
    avatarOffsetX: value.offsetX,
    avatarOffsetY: value.offsetY,
  });
  avatarOpen.value = false;
}
const uploadOpen = ref(false);
const chatPreferences = ref<InstanceType<typeof WaveChatPreferences> | null>(null);
function saveImage(value: { avatar: string }): void {
  emit('artwork', value.avatar);
  uploadOpen.value = false;
}
function save(): boolean {
  if (chatPreferences.value && !chatPreferences.value.save()) return false;
  phone.saveSettings();
  return true;
}
defineExpose({ save });
</script>
