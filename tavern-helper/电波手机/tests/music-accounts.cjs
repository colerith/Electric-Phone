const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const saved = new Map();
global.localStorage = {
  getItem: k => saved.get(k) || null,
  setItem: (k, v) => saved.set(k, v),
  removeItem: k => saved.delete(k),
};
function load() {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'services/music/music-accounts.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => id === './music-backend' ? { isBuiltinMusicBase: () => false } : require(id), module, module.exports);
  return module.exports;
}
let service = load(),
  handler;
const requests = [];
global.fetch = async (url, options) => {
  const u = new URL(url);
  const params = options.body ? Object.fromEntries(options.body) : Object.fromEntries(u.searchParams);
  assert.equal(u.searchParams.has('cookie'), false, 'credentials must never appear in URL');
  requests.push({ path: u.pathname, options, params });
  return { ok: true, json: async () => handler(u.pathname, params, options) };
};
const base = 'https://owned.example/api';
const image = 'data:image/png;base64,AAAA';
(async () => {
  for (const provider of ['netease', 'qq', 'kugou']) {
    handler = (route, params, options) => {
      const name = route.replace('/api', '');
      if (name === '/login/qr/key')
        return { code: 200, data: provider === 'kugou' ? { qrcode: 'qr-key' } : { unikey: 'qr-key' } };
      if (name === '/login/qr/create') return { code: 200, data: { qrimg: image } };
      if (name === '/login/qr/check')
        return provider === 'kugou'
          ? { status: 1, data: { status: 4, token: 'secret-kg', userid: '3' } }
          : { code: 803, cookie: provider === 'qq' ? 'qqmusic_session=secret-qq' : 'MUSIC_U=secret-ne' };
      if (provider === 'qq') assert.equal(options.headers['X-QQ-Session'], 'secret-qq');
      else assert.match(params.cookie, /secret-/);
      if (name === '/login/status')
        return {
          data: {
            profile:
              provider === 'qq'
                ? { info: { str_musicid: '2', nickname: 'QQ用户', logo: 'https://images.example/avatar' } }
                : { userId: 1, nickname: '网易用户', vipType: 11 },
          },
        };
      if (name === '/user/detail') return { status: 1, data: { user_info: { userid: 3, nickname: '酷狗用户' } } };
      if (name === '/vip/info') return { code: 200, data: { musicPackage: { expireTime: Date.now() + 500000 } } };
      if (name === '/user/vip/detail') return { status: 1, data: { busi_vip: [{ is_vip: 1 }] } };
      if (name === '/user/playlist')
        return provider === 'qq'
          ? { playlist: [{ tid: '55', dirId: 5, dirName: '我的私密歌单', songNum: 1 }] }
          : provider === 'netease'
            ? { playlist: [{ id: 55, name: '我的网易歌单', trackCount: 1 }], more: false }
            : {
                status: 1,
                data: { info: [{ id: 'wrong-local-id', global_collection_id: '55', name: '我的酷狗歌单', count: 1 }] },
              };
      if (name === '/user/playlist-detail') {
        assert.equal(params.tid, '55');
        assert.equal(params.dirid, '5');
        return { songs: [{ mid: 'track', name: '歌曲', singer: [{ name: '歌手' }] }], more: false };
      }
      if (name === '/playlist/track/all')
        return {
          songs: [
            provider === 'netease'
              ? { id: 'track', name: '歌曲', ar: [{ name: '歌手' }] }
              : { FileHash: 'track', filename: '歌曲', singername: '歌手' },
          ],
        };
      if (name === '/song/url/v1') return { data: [{ url: 'https://media.example/ne.mp3' }] };
      if (name === '/getMusicPlay') return { data: { playUrl: { track: { url: 'https://media.example/qq.mp3' } } } };
      if (name === '/song/url') {
        assert.equal(params.quality, '320');
        return { data: { play_url: ['https://media.example/kg.mp3'] } };
      }
      if (name === '/lyric') return { lrc: { lyric: '[00:00]测试' } };
      throw new Error('Unexpected fixture route ' + name);
    };
    assert.equal((await service.createMusicQr(provider, base, 'qq')).image, image);
    assert.equal(await service.checkMusicQr(provider, base, 'qr-key'), 'confirmed');
    const profile = await service.refreshMusicAccount(provider, base);
    assert.equal(profile.membership, provider === 'qq' ? '会员状态暂无法确认' : '会员有效');
    const page = await service.fetchAccountPlaylists(provider, base, profile.id);
    assert.equal(page.lists.length, 1);
    assert.equal(page.lists[0].id, '55');
    const songs = await service.fetchAccountTracks(provider, base, page.lists[0]);
    assert.equal(songs.tracks.length, 1);
    assert.equal(songs.tracks[0].source, 'account-' + provider);
    assert.match((await service.resolveAccountTrack(songs.tracks[0])).url, /^https:\/\/media/);
    assert.equal(service.cachedMusicAccount(provider, 'https://different.example'), undefined);
  }
  handler = () => ({ code: 803 });
  await assert.rejects(service.checkMusicQr('netease', base, 'missing-cookie'), /登录态/);
  let deviceAttempts = 0;
  handler = (route, params) => {
    if (route.endsWith('/register/dev')) return { status: 1, data: { dfid: 'fresh-device' } };
    assert.match(params.cookie, /token=secret-kg/);
    if (deviceAttempts++ === 0) return { status: 0, error_code: 20028 };
    assert.match(params.cookie, /dfid=fresh-device/);
    return { status: 1, data: { info: [] } };
  };
  assert.equal((await service.fetchAccountPlaylists('kugou', base, '3')).lists.length, 0);
  // Restore the display cache cleared while capturing a replacement device cookie.
  handler = route =>
    route.endsWith('/user/detail')
      ? { status: 1, data: { user_info: { userid: 3, nickname: '酷狗用户' } } }
      : { status: 1, data: { is_vip: 1 } };
  await service.refreshMusicAccount('kugou', base);
  service = load(); // reload script: saved login is restored, without chat variables.
  assert.equal(service.cachedMusicAccount('netease', base).name, '网易用户');
  handler = () => ({ code: 800 });
  assert.equal(await service.checkMusicQr('netease', base, 'expired'), 'expired');
  handler = () => ({ code: 200, unexpected: [] });
  await assert.rejects(service.fetchAccountPlaylists('netease', base, '1'), /有效列表/);
  handler = () => ({ code: 301 });
  await assert.rejects(service.refreshMusicAccount('netease', base), /登录已失效/);
  let resolve;
  handler = () =>
    new Promise(r => {
      resolve = r;
    });
  const pending = service.checkMusicQr('qq', base, 'late');
  await new Promise(r => setImmediate(r));
  service.clearMusicAccount('qq', base);
  resolve({ code: 803, cookie: 'qqmusic_session=late-secret' });
  await assert.rejects(pending, e => e.name === 'AbortError');
  assert.equal(service.cachedMusicAccount('qq', base), undefined);
  const aborted = new AbortController();
  const pendingAbort = service.checkMusicQr('netease', base, 'cancel', aborted.signal);
  await new Promise(r => setImmediate(r));
  aborted.abort();
  resolve({ code: 803, cookie: 'MUSIC_U=canceled-secret' });
  await assert.rejects(pendingAbort, e => e.name === 'AbortError');
  assert.ok(![...saved.values()].some(v => v.includes('canceled-secret')));
  handler = () => ({ code: 200 });
  await service.logoutMusicAccount('netease', base);
  assert.equal(service.cachedMusicAccount('netease', base), undefined);
  assert.ok(service.cachedMusicAccount('kugou', base), 'logout only affects selected provider');
  console.log(
    'music accounts: three providers, membership, playlists, playback, persistence, isolation, cancellation passed',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
