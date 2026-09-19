import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { musicIntent, parseLrc, resolveTrack, searchMusic, type Track } from '../services/music/music';
import { fetchRecommendations, extraLyrics, simplifyLyrics } from '../services/music/music-discovery';
import { nextQueueIndex, type PlaybackMode } from '../services/music/music-queue';
import { startMusicPlayback } from '../services/music/music-playback';
import { usePhoneStore } from './phone';
export const useMusicStore = defineStore('wave-music', () => {
  const phone = usePhoneStore();
  const view = ref<'home' | 'player'>('home');
  const playlistOpen = ref(false),
    playlistCover = ref('');
  const current = ref<Track | null>(null),
    tracks = ref<Track[]>([]),
    playing = ref(false),
    busy = ref(false),
    error = ref(''),
    time = ref(0),
    duration = ref(0);
  const radioTrack = ref<Track | null>(null);
  const queueOpen = ref(false),
    hasStarted = ref(false),
    notice = ref('');
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function inform(text: string) {
    notice.value = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice.value = ''), 1800);
  }
  const mode = computed(() => phone.settings.musicPlaybackMode);
  const modeLabel = computed(
    () => ({ sequence: '顺序播放', shuffle: '随机播放', loop: '列表循环', single: '单曲循环' })[mode.value],
  );
  const modeIcon = computed(() =>
    mode.value === 'shuffle'
      ? 'fa-solid fa-shuffle'
      : mode.value === 'sequence'
        ? 'fa-solid fa-arrow-down-wide-short'
        : 'fa-solid fa-repeat',
  );
  function setMode(value: PlaybackMode) {
    phone.settings.musicPlaybackMode = value;
    phone.saveSettings();
  }
  function cycleMode() {
    const modes: PlaybackMode[] = ['sequence', 'shuffle', 'loop', 'single'];
    setMode(modes[(modes.indexOf(mode.value) + 1) % modes.length]);
  }
  const repeat = computed({ get: () => mode.value === 'single', set: value => setMode(value ? 'single' : 'sequence') });
  const isCurrent = (track: Track) =>
    Boolean(
      current.value &&
      ((track.id === current.value.id && track.source === current.value.source) ||
        (track.title === current.value.title && track.artist === current.value.artist)),
    );
  const isHidden = (track: Track) =>
    (phone.state.musicHiddenTracks[phone.state.activeCharKey] || []).includes(`${track.source}:${track.id}`);
  function isFavorite(track: Track) {
    const ids = phone.state.musicFavorites[phone.state.activeCharKey] || [];
    return (
      ids.includes(`${track.source}:${track.id}`) ||
      (phone.state.musicCatalog[phone.state.activeCharKey] || []).some(
        t => t.title === track.title && t.artist === track.artist && ids.includes(`${t.source}:${t.id}`),
      )
    );
  }
  function favorite(track: Track) {
    const ids = phone.state.musicFavorites[phone.state.activeCharKey] || [];
    const previous = (phone.state.musicCatalog[phone.state.activeCharKey] || []).find(
      t => t.title === track.title && t.artist === track.artist && ids.includes(`${t.source}:${t.id}`),
    );
    phone.rememberMusicTracks([track]);
    const target = previous || track;
    phone.toggleMusicFavorite(`${target.source}:${target.id}`);
  }
  function moveQueue(from: number, to: number) {
    const rows = queue.value;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= rows.length ||
      to >= rows.length ||
      from === to
    )
      return;
    rows.splice(to, 0, rows.splice(from, 1)[0]);
    phone.saveMusicLibrary();
  }
  function clearQueue() {
    phone.state.musicQueues[phone.state.activeCharKey] = [];
    phone.saveMusicLibrary();
  }

  const togetherSeconds = ref(0);
  const queue = computed(() => phone.state.musicQueues[phone.state.activeCharKey] || []);
  const playlists = computed(() => phone.state.musicPlaylists[phone.state.activeCharKey] || []);
  const daily = computed<Track[]>(() =>
    [
      ['晴天', '周杰伦'],
      ['小幸运', '田馥甄'],
      ['稻香', '周杰伦'],
      ['遇见', '孙燕姿'],
      ['橄榄树', '齐豫'],
      ['修炼爱情', '林俊杰'],
    ]
      .map(([title, artist]) => ({
        id: `daily-${title}`,
        title,
        artist,
        album: '每日精选',
        cover: '',
        url: '',
        lyric: '',
        picId: '',
        lyricId: '',
        source: 'daily',
      }))
      .filter(track => !isHidden(track)),
  );
  const searching = ref(false),
    searchStatus = ref('');
  let searchRequest: AbortController | undefined;
  const recommendations = ref<Track[]>([]),
    recommendationNotice = ref(''),
    recommendationBusy = ref(false);
  let discoveryRequest: AbortController | undefined;
  async function loadRecommendations() {
    discoveryRequest?.abort();
    const controller = new AbortController();
    discoveryRequest = controller;
    recommendationBusy.value = true;
    try {
      const result = await fetchRecommendations(
        phone.settings.musicSource,
        phone.settings.neteaseApi,
        phone.settings.qqMusicApi,
        controller.signal,
        phone.settings.musicPersonalized,
      );
      if (controller.signal.aborted) return;
      recommendations.value = result.tracks.filter(track => !isHidden(track));
      recommendationNotice.value = result.label;
      phone.rememberMusicTracks(result.tracks);
    } catch {
      if (!controller.signal.aborted) {
        recommendations.value = [];
        recommendationNotice.value = '在线推荐暂不可用，先听听精选歌曲';
      }
    } finally {
      if (discoveryRequest === controller) recommendationBusy.value = false;
    }
  }
  function editPlaylist(id: string, name: string, cover: string) {
    const row = playlists.value.find(list => list.id === id);
    if (!row || !name.trim()) return;
    row.name = name.trim().slice(0, 80);
    row.cover = cover;
    phone.saveMusicLibrary();
  }
  function deletePlaylist(id: string) {
    phone.state.musicPlaylists[phone.state.activeCharKey] = playlists.value.filter(row => row.id !== id);
    phone.saveMusicLibrary();
  }
  function enqueue(track: Track, feedback = false) {
    const key = phone.state.activeCharKey;
    if (!key) return;
    const rows = (phone.state.musicQueues[key] ||= []);
    const exists = rows.some(t => t.id === track.id && t.source === track.source);
    if (!exists) rows.push({ ...track, url: '', lyric: '' });
    if (feedback) inform(exists ? '已在播放列表中' : '已加入播放列表');
    phone.rememberMusicTracks([track]);
    phone.saveMusicLibrary();
  }
  function removeQueue(index: number) {
    phone.state.musicQueues[phone.state.activeCharKey]?.splice(index, 1);
    phone.saveMusicLibrary();
  }
  function createPlaylist(name: string) {
    if (!name.trim() || !phone.state.activeCharKey) return;
    (phone.state.musicPlaylists[phone.state.activeCharKey] ||= []).push({
      id: `${Date.now()}-${Math.random()}`,
      name: name.trim().slice(0, 80),
      cover: '',
      tracks: [],
    });
    phone.saveMusicLibrary();
  }
  function collect(id: string, track: Track) {
    const list = playlists.value.find(row => row.id === id);
    if (!list) return;
    if (list.tracks.some(t => t.id === track.id && t.source === track.source)) {
      inform('这首歌已在歌单中');
      return;
    }
    list.tracks.push({ ...track, url: '', lyric: '' });
    phone.rememberMusicTracks([track]);
    phone.saveMusicLibrary();
    inform(`已收藏到「${list.name}」`);
  }
  function removeFromPlaylist(id: string, track: Track) {
    const list = playlists.value.find(row => row.id === id);
    if (!list) return;
    const key = `${track.source}:${track.id}`;
    list.tracks = list.tracks.filter(item => `${item.source}:${item.id}` !== key);
    phone.saveMusicLibrary();
    inform(`已从「${list.name}」移出`);
  }
  function playPlaylist(id: string) {
    const list = playlists.value.find(row => row.id === id);
    if (!list?.tracks.length) return;
    phone.state.musicQueues[phone.state.activeCharKey] = list.tracks.map(t => ({ ...t }));
    phone.saveMusicLibrary();
    void select(list.tracks[0]);
    view.value = 'player';
  }
  let ticker: ReturnType<typeof setInterval> | undefined;
  watch(
    playing,
    active => {
      clearInterval(ticker);
      if (active) ticker = setInterval(() => togetherSeconds.value++, 1000);
    },
    { flush: 'sync' },
  );
  watch(
    [current, playing],
    () => {
      phone.listening = current.value
        ? {
            charKey: phone.state.activeCharKey,
            title: current.value.title,
            artist: current.value.artist,
            playing: playing.value,
          }
        : null;
    },
    { flush: 'sync' },
  );
  let audio: HTMLAudioElement | undefined,
    request: AbortController | undefined,
    context = '';
  let syncId = 0;
  let lastIntent = '';
  let automaticRequest: AbortController | undefined;
  let automaticFallback: (() => Promise<void>) | undefined;
  function cancelAutomatic() {
    automaticFallback = undefined;
    if (automaticRequest) {
      automaticRequest.abort();
      if (request === automaticRequest) busy.value = false;
      if (searchRequest === automaticRequest) searching.value = false;
      automaticRequest = undefined;
    }
  }
  function player() {
    if (!audio) {
      audio = new Audio();
      audio.onplaying = () => {
        playing.value = true;
        hasStarted.value = true;
      };
      audio.onpause = () => (playing.value = false);
      audio.ontimeupdate = () => (time.value = audio!.currentTime);
      audio.ondurationchange = () => (duration.value = Number.isFinite(audio!.duration) ? audio!.duration : 0);
      audio.onended = () => {
        playing.value = false;
        void step(1, true);
      };
      audio.onerror = () => {
        playing.value = false;
        if (automaticFallback && !busy.value) {
          void automaticFallback();
          return;
        }
        error.value = '音频加载失败，可重试或切换音源';
      };
    }
    return audio;
  }
  function reset(key: string) {
    if (context === key) return;
    context = key;
    lastIntent = '';
    radioTrack.value = null;
    cancelAutomatic();
    request?.abort();
    discoveryRequest?.abort();
    searchRequest?.abort();
    searching.value = false;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    current.value = null;
    hasStarted.value = false;
    queueOpen.value = false;
    togetherSeconds.value = 0;
    tracks.value = [];
    time.value = 0;
    duration.value = 0;
    error.value = '';
    busy.value = false;
  }
  async function search(query: string) {
    ++syncId;
    cancelAutomatic();
    tracks.value = [];
    searchStatus.value = '';
    searchRequest?.abort();
    searching.value = false;
    if (!query.trim()) return;
    searchRequest?.abort();
    const controller = new AbortController();
    searchRequest = controller;
    searching.value = true;
    error.value = '';
    try {
      const rows = await searchMusic(
        query,
        phone.settings.musicApi,
        phone.settings.musicSource,
        controller.signal,
        (rows, status) => {
          if (controller.signal.aborted || searchRequest !== controller) return;
          tracks.value = rows.filter(track => !isHidden(track));
          searchStatus.value = status;
        },
      );
      if (!controller.signal.aborted) {
        tracks.value = rows.filter(track => !isHidden(track));
        phone.rememberMusicTracks(tracks.value);
      }
    } catch (e) {
      if (!controller.signal.aborted) error.value = e instanceof Error ? e.message : '搜索失败';
    } finally {
      if (searchRequest === controller) searching.value = false;
    }
  }
  async function select(track: Track, autoplay = true) {
    ++syncId;
    cancelAutomatic();
    if (searching.value) searchStatus.value = '已停止后续查询，保留已返回的结果';
    searchRequest?.abort();
    searching.value = false;
    request?.abort();
    audio?.pause();
    const controller = new AbortController();
    request = controller;
    busy.value = true;
    error.value = '';
    enqueue(track);
    current.value = track;
    time.value = 0;
    duration.value = 0;
    try {
      if (track.source === 'daily') {
        const matches = await searchMusic(
          `${track.title} ${track.artist}`,
          phone.settings.musicApi,
          phone.settings.musicSource,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const match = matches.find(t => t.title === track.title && t.artist.includes(track.artist));
        if (!match) throw new Error('当前音源未找到这首歌，请搜索其他版本');
        track = match;
        phone.rememberMusicTracks([track]);
      }
      const [resolved, extra] = await Promise.all([
        resolveTrack(track, phone.settings.musicApi, controller.signal),
        extraLyrics(track, phone.settings.neteaseApi, phone.settings.qqMusicApi, controller.signal),
      ]);
      resolved.lyric = simplifyLyrics(extra || resolved.lyric);
      if (controller.signal.aborted) return;
      current.value = resolved;
      player().src = resolved.url;
      if (autoplay) await startMusicPlayback(player(), controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) error.value = e instanceof Error ? e.message : '播放失败';
    } finally {
      if (request === controller) busy.value = false;
    }
  }
  async function toggle() {
    if (!current.value) return;
    if (!playing.value && automaticFallback && automaticRequest) {
      const retry = automaticFallback;
      const controller = automaticRequest;
      busy.value = true;
      error.value = '';
      try {
        await startMusicPlayback(player(), controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          if (e instanceof Error && e.name === 'NotAllowedError') error.value = '浏览器限制播放，请再次点击播放';
          else await retry();
        }
      } finally {
        if (request === controller) busy.value = false;
      }
      return;
    }
    ++syncId;
    cancelAutomatic();
    if (!current.value.url) {
      await select(current.value);
      return;
    }
    try {
      if (playing.value) player().pause();
      else await player().play();
    } catch {
      error.value = '请点击播放重试，浏览器可能限制自动播放';
    }
  }
  function seek(value: number) {
    if (audio && Number.isFinite(value) && duration.value > 0) {
      audio.currentTime = Math.max(0, Math.min(duration.value, value));
      time.value = audio.currentTime;
    }
  }
  async function step(offset: number, ended = false) {
    const rows = queue.value;
    const index = rows.findIndex(isCurrent);
    const next = nextQueueIndex(rows.length, index, offset, mode.value, ended);
    if (next < 0) {
      if (!ended) inform(offset > 0 ? '已经是最后一首' : '已经是第一首');
      return;
    }
    if (ended && mode.value === 'single' && isCurrent(rows[next])) {
      seek(0);
      await toggle();
      return;
    }
    await select(rows[next]);
  }
  async function sync(raw: string, key: string, force = false) {
    reset(key);
    const intent = musicIntent(raw);
    const signature = JSON.stringify([
      key,
      intent.title,
      intent.artist,
      phone.settings.musicApi,
      phone.settings.musicSource,
    ]);
    if (!force && signature === lastIntent) return;
    lastIntent = signature;
    radioTrack.value = null;
    const version = ++syncId;
    cancelAutomatic();
    if (!intent.title || !key) return;
    request?.abort();
    searchRequest?.abort();
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    current.value = null;
    const controller = new AbortController();
    request = searchRequest = automaticRequest = controller;
    const active = () => !controller.signal.aborted && context === key && version === syncId;
    busy.value = searching.value = true;
    error.value = '';
    tracks.value = [];
    searchStatus.value = '正在搜索角色想听的歌曲…';
    let candidates: Track[] = [];
    let index = 0;
    const playNext = async () => {
      if (!active()) return;
      automaticFallback = undefined;
      busy.value = true;
      error.value = '';
      while (index < candidates.length && active()) {
        const track = candidates[index++];
        searchStatus.value = `正在尝试音源 ${index}/${candidates.length} · ${track.title}`;
        time.value = duration.value = 0;
        try {
          const resolved = await resolveTrack(track, phone.settings.musicApi, controller.signal);
          if (!active()) return;
          if (!resolved.url) throw new Error('没有可播放链接');
          resolved.lyric = simplifyLyrics(resolved.lyric);
          current.value = resolved;
          radioTrack.value = resolved;
          player().src = resolved.url;
          await startMusicPlayback(player(), controller.signal);
          if (!active()) return;
          enqueue(resolved);
          error.value = '';
          searchStatus.value = `已播放 · ${resolved.title} · ${resolved.artist}`;
          automaticFallback = playNext;
          // Optional lyrics must not hold up playback or reject a working audio source.
          void extraLyrics(resolved, phone.settings.neteaseApi, phone.settings.qqMusicApi, controller.signal)
            .then(lyric => {
              if (active() && current.value?.url === resolved.url && lyric) current.value.lyric = simplifyLyrics(lyric);
            })
            .catch(() => {});
          busy.value = false;
          return;
        } catch (e) {
          if (!active()) return;
          if (e instanceof Error && e.name === 'NotAllowedError') {
            error.value = '浏览器限制自动播放，已找到音源，请点击播放继续';
            searchStatus.value = '';
            if (current.value) enqueue(current.value);
            automaticFallback = playNext;
            busy.value = false;
            return;
          }
          player().pause();
          player().removeAttribute('src');
          player().load();
          current.value = null;
        }
      }
      if (active()) {
        busy.value = false;
        playing.value = false;
        current.value = null;
        searchStatus.value = '';
        error.value = candidates.length
          ? '已尝试全部搜索结果，暂无可播放音源，可切换音源或稍后重试'
          : '未找到歌曲，请尝试其他歌名或音源';
      }
    };
    try {
      const rows = await searchMusic(
        `${intent.title} ${intent.artist}`.trim(),
        phone.settings.musicApi,
        phone.settings.musicSource,
        controller.signal,
        (rows, status) => {
          if (!active()) return;
          tracks.value = rows.filter(track => !isHidden(track));
          searchStatus.value = status;
        },
      );
      if (!active()) return;
      const seen = new Set<string>();
      candidates = rows.filter(track => {
        const id = `${track.source}:${track.id}`;
        if (isHidden(track) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      tracks.value = candidates;
      phone.rememberMusicTracks(candidates);
      searching.value = false;
      await playNext();
    } catch (e) {
      if (active()) error.value = e instanceof Error ? e.message : '自动搜索播放失败';
    } finally {
      if (active()) {
        busy.value = searching.value = false;
      }
    }
  }
  const lyrics = computed(() => parseLrc(current.value?.lyric || ''));
  const lyricIndex = computed(() =>
    lyrics.value.reduce((found, row, index) => (row.time <= time.value ? index : found), -1),
  );
  function stop() {
    ++syncId;
    cancelAutomatic();
    request?.abort();
    discoveryRequest?.abort();
    searchRequest?.abort();
    searching.value = false;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    playing.value = false;
    current.value = null;
    hasStarted.value = false;
    queueOpen.value = false;
  }
  function deleteTrack(track: Track) {
    if (isCurrent(track)) stop();
    tracks.value = tracks.value.filter(item => item.id !== track.id || item.source !== track.source);
    recommendations.value = recommendations.value.filter(item => item.id !== track.id || item.source !== track.source);
    phone.deleteMusicTrack(track);
    inform('歌曲已从音乐资料中删除');
  }
  onScopeDispose(() => {
    stop();
    clearInterval(ticker);
    clearTimeout(noticeTimer);
    phone.listening = null;
  });
  return {
    searching,
    searchStatus,
    queueOpen,
    hasStarted,
    mode,
    modeLabel,
    modeIcon,
    setMode,
    cycleMode,
    moveQueue,
    clearQueue,
    isCurrent,
    isFavorite,
    favorite,
    deleteTrack,
    notice,
    playlistOpen,
    playlistCover,
    recommendations,
    recommendationNotice,
    recommendationBusy,
    loadRecommendations,
    editPlaylist,
    deletePlaylist,
    daily,
    queue,
    playlists,
    enqueue,
    removeQueue,
    createPlaylist,
    collect,
    removeFromPlaylist,
    playPlaylist,
    togetherSeconds,
    view,
    current,
    radioTrack,
    tracks,
    playing,
    busy,
    error,
    time,
    duration,
    repeat,
    lyrics,
    lyricIndex,
    search,
    select,
    toggle,
    seek,
    step,
    sync,
    reset,
    stop,
  };
});
