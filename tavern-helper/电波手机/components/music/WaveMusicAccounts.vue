<template>
  <section class="music-accounts" :class="{ 'music-accounts-settings': configure }">
    <div v-if="configure" class="music-account-heading">
      <span><strong>我的音乐账号</strong><small>登录平台 · 会员状态 · 个人歌单</small></span>
    </div>
    <button v-else class="music-account-heading" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span><strong>我的音乐账号</strong><small>登录平台 · 会员状态 · 个人歌单</small></span>
      <i :class="expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"></i>
    </button>
    <template v-if="configure || expanded">
      <WaveSelect
        v-model="provider"
        :options="accountProviders.map(p => ({ value: p.id, label: p.name }))"
        aria-label="音乐账号平台"
      />
      <div v-if="isExtensionRuntime" class="music-account-backend">
        <p class="music-account-hint">
          {{
            musicBackend === 'ready'
              ? '酒馆音乐插件已连接，无需填写服务地址。'
              : musicBackend === 'checking'
                ? '正在检测酒馆音乐插件…'
                : '尚未检测到音乐后端插件，安装并重启酒馆后可直接扫码。'
          }}
        </p>
        <div class="music-account-actions">
          <button
            v-if="musicBackend !== 'ready'"
            type="button"
            :disabled="musicBackend === 'checking'"
            @click="checkMusicBackend"
          >
            重新检测
          </button>
          <button
            v-if="musicBackend === 'ready' && phone.settings.musicAccountApis[provider]"
            type="button"
            @click="useBuiltin"
          >
            使用酒馆音乐插件
          </button>
        </div>
      </div>
      <label
        v-if="configure && (musicBackend !== 'ready' || phone.settings.musicAccountApis[provider])"
        class="music-account-endpoint"
        >{{ providerInfo.name }}登录服务
        <input v-model="draftBase" type="url" placeholder="https://你的音乐服务地址" @change="saveBase" />
        <small>{{ providerInfo.backend }} 兼容接口；需允许酒馆地址跨域访问。只向此服务发送该平台的登录凭据。</small>
      </label>
      <p v-if="!base" class="music-account-hint">安装酒馆音乐插件，或填写已有的兼容音乐服务地址。</p>
      <template v-else>
        <div v-if="account" class="music-account-profile">
          <img v-if="account.avatar" :src="account.avatar" alt="" referrerpolicy="no-referrer" />
          <i v-else class="fa-solid fa-circle-user"></i>
          <span
            ><strong>{{ account.name }}</strong
            ><small>{{ account.membership }}</small></span
          >
        </div>
        <WaveSelect
          v-if="provider === 'qq' && !account"
          v-model="channel"
          :options="[
            { value: 'qq', label: 'QQ 音乐扫码' },
            { value: 'wechat', label: '微信扫码' },
          ]"
          aria-label="QQ 音乐登录方式"
        />
        <div class="music-account-actions">
          <button type="button" :disabled="busy" @click="login">{{ account ? '重新登录' : '扫码登录' }}</button>
          <button type="button" :disabled="busy" @click="refresh">
            {{ account ? '刷新账号与歌单' : '恢复已保存登录' }}
          </button>
          <button v-if="account" class="is-danger" type="button" :disabled="busy" @click="logout">退出登录</button>
          <button v-if="busy" type="button" @click="cancel">取消</button>
        </div>
        <div v-if="qrImage" class="music-account-qr">
          <img :src="qrImage" alt="音乐平台登录二维码" referrerpolicy="no-referrer" />
          <small>使用对应平台扫码并确认；也可保存图片后从平台相册识别。</small>
        </div>
        <p v-if="status" class="music-account-status" role="status">{{ status }}</p>
        <p v-if="error" class="music-account-error" role="alert">{{ error }}</p>
        <template v-if="selected">
          <div class="music-account-list-heading">
            <button type="button" @click="backToLists">‹ 返回歌单</button><strong>{{ selected.name }}</strong>
          </div>
          <article v-for="track in songs" :key="track.source + track.id" class="music-account-song">
            <button type="button" @click="play(track)">
              <strong>{{ track.title }}</strong
              ><small>{{ track.artist }}</small>
            </button>
            <button type="button" :aria-label="`加入队列：${track.title}`" @click="music.enqueue(track, true)">
              <i class="fa-solid fa-plus"></i>
            </button>
          </article>
          <button v-if="songsMore" type="button" :disabled="busy" @click="loadSongs(true)">加载更多歌曲</button>
          <p v-if="!busy && !songs.length && !error" class="music-account-hint">这张歌单暂无可读取的歌曲。</p>
        </template>
        <template v-else>
          <button
            v-for="list in lists"
            :key="list.id"
            class="music-account-playlist"
            type="button"
            :disabled="busy"
            @click="openList(list)"
          >
            <img v-if="list.cover" :src="list.cover" alt="" referrerpolicy="no-referrer" /><i
              v-else
              class="fa-solid fa-music"
            ></i>
            <span
              ><strong>{{ list.name }}</strong
              ><small>{{ list.count }} 首</small></span
            ><i class="fa-solid fa-chevron-right"></i>
          </button>
          <button v-if="listsMore" type="button" :disabled="busy" @click="loadLists(true)">加载更多歌单</button>
          <p v-if="loaded && !busy && !lists.length && !error" class="music-account-hint">此账号暂无可读取的歌单。</p>
        </template>
        <p class="music-account-hint">登录仅保存在当前浏览器，不随聊天或备份上传。播放范围由平台及账号权限决定。</p>
      </template>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import WaveSelect from '../shared/WaveSelect.vue';
import { usePhoneStore } from '../../stores/phone';
import { useMusicStore } from '../../stores/music';
import {
  accountBase,
  accountProviders,
  cachedMusicAccount,
  createMusicQr,
  checkMusicQr,
  refreshMusicAccount,
  fetchAccountPlaylists,
  fetchAccountTracks,
  logoutMusicAccount,
  type MusicAccountProvider,
  type MusicAccount,
  type AccountPlaylist,
} from '../../services/music/music-accounts';
import { musicBackend, checkMusicBackend, builtinMusicBase } from '../../services/music/music-backend';
import { isExtensionRuntime } from '../../services/core/runtime';
import type { Track } from '../../services/music/music';
const props = defineProps<{ configure?: boolean }>();
const phone = usePhoneStore(),
  music = useMusicStore();
const expanded = ref(Boolean(props.configure)),
  provider = ref<MusicAccountProvider>('netease'),
  channel = ref('qq');
const providerInfo = computed(() => accountProviders.find(p => p.id === provider.value)!);
const base = computed(
  () =>
    phone.settings.musicAccountApis[provider.value] ||
    (musicBackend.value === 'ready' ? builtinMusicBase(provider.value) : ''),
);
onMounted(() => {
  if (musicBackend.value === 'idle') void checkMusicBackend();
});
function useBuiltin() {
  phone.settings.musicAccountApis[provider.value] = '';
  phone.saveSettings();
}

const draftBase = ref(''),
  account = ref<MusicAccount>(),
  busy = ref(false),
  error = ref(''),
  status = ref(''),
  qrImage = ref('');
const lists = ref<AccountPlaylist[]>([]),
  selected = ref<AccountPlaylist>(),
  songs = ref<Track[]>([]);
const listsMore = ref(false),
  songsMore = ref(false),
  loaded = ref(false);
let listOffset = 0,
  songOffset = 0,
  controller: AbortController | undefined;
function cancel() {
  controller?.abort();
  controller = undefined;
  busy.value = false;
  qrImage.value = '';
  status.value = '';
}
function reset() {
  cancel();
  account.value = undefined;
  lists.value = [];
  selected.value = undefined;
  songs.value = [];
  listsMore.value = false;
  songsMore.value = false;
  loaded.value = false;
  error.value = '';
  draftBase.value = phone.settings.musicAccountApis[provider.value];
  try {
    account.value = cachedMusicAccount(provider.value, base.value);
  } catch {
    error.value = '请检查音乐登录服务地址';
  }
}
watch([provider, base], reset, { immediate: true });
watch(expanded, value => {
  if (!value) cancel();
});
onBeforeUnmount(cancel);
function saveBase() {
  try {
    phone.settings.musicAccountApis[provider.value] = draftBase.value.trim() ? accountBase(draftBase.value) : '';
    phone.saveSettings();
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '地址无效';
  }
}
async function run(action: (signal: AbortSignal, p: MusicAccountProvider, endpoint: string) => Promise<void>) {
  cancel();
  const current = new AbortController();
  controller = current;
  busy.value = true;
  error.value = '';
  try {
    await action(current.signal, provider.value, base.value);
  } catch (e) {
    if (!current.signal.aborted) error.value = e instanceof Error ? e.message : '操作失败';
  } finally {
    if (controller === current) {
      busy.value = false;
      qrImage.value = '';
    }
  }
}
async function refreshData(signal: AbortSignal, p: MusicAccountProvider, endpoint: string) {
  const profile = await refreshMusicAccount(p, endpoint, signal);
  if (signal.aborted) return;
  account.value = profile;
  const page = await fetchAccountPlaylists(p, endpoint, profile.id, 0, signal);
  if (signal.aborted) return;
  lists.value = page.lists;
  listOffset = page.next;
  listsMore.value = page.more;
  loaded.value = true;
  selected.value = undefined;
  status.value = '账号与歌单已更新';
}
function refresh() {
  return run(refreshData);
}
function delay(signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 2500);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}
function login() {
  return run(async (signal, p, endpoint) => {
    status.value = '正在获取二维码…';
    const qr = await createMusicQr(p, endpoint, channel.value, signal);
    if (signal.aborted) return;
    qrImage.value = qr.image;
    status.value = '等待扫码';
    const expires = Date.now() + 170000;
    let failures = 0;
    while (!signal.aborted && Date.now() < expires) {
      await delay(signal);
      if (signal.aborted) return;
      let state: Awaited<ReturnType<typeof checkMusicQr>>;
      try {
        state = await checkMusicQr(p, endpoint, qr.key, signal);
        failures = 0;
      } catch (e) {
        if (signal.aborted) return;
        if (++failures >= 3) throw e;
        status.value = '连接暂时中断，正在重试…';
        continue;
      }
      if (signal.aborted) return;
      if (state === 'confirmed') {
        qrImage.value = '';
        status.value = '登录成功，正在读取账号…';
        await refreshData(signal, p, endpoint);
        return;
      }
      if (state === 'expired') {
        status.value = '二维码已过期，请重新扫码';
        return;
      }
      status.value = state === 'scanned' ? '已扫码，请在手机上确认' : '等待扫码';
    }
    if (!signal.aborted) status.value = '二维码已过期，请重新扫码';
  });
}
function logout() {
  return run(async (signal, p, endpoint) => {
    const pending = logoutMusicAccount(p, endpoint);
    account.value = undefined;
    lists.value = [];
    selected.value = undefined;
    songs.value = [];
    loaded.value = false;
    listsMore.value = false;
    await pending;
    if (!signal.aborted) status.value = '已退出登录';
  });
}
function loadLists(append: boolean) {
  return run(async (signal, p, endpoint) => {
    const page = await fetchAccountPlaylists(p, endpoint, account.value?.id || '', append ? listOffset : 0, signal);
    if (signal.aborted) return;
    lists.value = [...new Map([...(append ? lists.value : []), ...page.lists].map(list => [list.id, list])).values()];
    listOffset = page.next;
    listsMore.value = page.more;
    loaded.value = true;
  });
}
function openList(list: AccountPlaylist) {
  selected.value = list;
  songs.value = [];
  songsMore.value = false;
  songOffset = 0;
  void loadSongs(false);
}
function backToLists() {
  cancel();
  selected.value = undefined;
  error.value = '';
}
function loadSongs(append: boolean) {
  const list = selected.value;
  if (!list) return;
  return run(async (signal, p, endpoint) => {
    const page = await fetchAccountTracks(p, endpoint, list, append ? songOffset : 0, signal);
    if (signal.aborted) return;
    songs.value = [
      ...new Map([...(append ? songs.value : []), ...page.tracks].map(track => [track.id, track])).values(),
    ];
    songOffset = page.next;
    songsMore.value = page.more;
  });
}
function play(track: Track) {
  void music.select(track);
  music.view = 'player';
}
</script>
