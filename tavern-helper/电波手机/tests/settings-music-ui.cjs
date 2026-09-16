const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const schemas = fs.readFileSync(path.join(root, 'schemas.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.vue'), 'utf8');
const appearance = fs.readFileSync(path.join(root, 'components/WaveHomeAppearance.vue'), 'utf8');
const music = fs.readFileSync(path.join(root, 'components/WaveMusicPanel.vue'), 'utf8');
const playlists = fs.readFileSync(path.join(root, 'components/WavePlaylists.vue'), 'utf8');
const musicStore = fs.readFileSync(path.join(root, 'stores/music.ts'), 'utf8');
const settingsStyle = fs.readFileSync(path.join(root, 'settings.scss'), 'utf8');
const musicStyle = fs.readFileSync(path.join(root, 'music-refinements.scss'), 'utf8');

assert.match(schemas, /contextLength:[\s\S]*?prefault\(100000\)/);
assert.match(schemas, /maxTokens:[\s\S]*?prefault\(30000\)/);
assert.match(schemas, /showStatusBar: z\.boolean\(\)\.prefault\(true\)/);
assert.match(app, /v-if="store\.settings\.appearance\.showStatusBar" class="wave-status-time"/);
assert.match(app, /<WaveDeviceStatus v-if="store\.settings\.appearance\.showStatusBar"/);
assert.match(appearance, /v-model="appearance\.showStatusBar"/);
assert.match(settingsStyle, /background-image: none !important;/);
assert.doesNotMatch(music, /class="wave-content-delete" aria-label="删除歌曲"/);
assert.match(music, /v-if="favoritesOnly"[\s\S]*?class="music-track-delete-action"/);
assert.match(music, /@contextmenu\.prevent="revealTrack\(track\)"/);
assert.match(music, /@pointerdown="startTrackSwipe\(\$event, track\)"/);
assert.match(music, /@click\.capture="suppressTrackAction"/);
assert.doesNotMatch(music, /class="music-mode-caption"/);
assert.match(musicStyle, /\.music-track-swipe > article[\s\S]*?background: transparent;/);
assert.doesNotMatch(musicStyle, /\.music-track-swipe\.deletable > article\s*{[\s\S]*?background:/);
assert.match(playlists, /@contextmenu\.prevent="removingTrack = trackKey\(track\)"/);
assert.match(playlists, /@pointerdown="startSongSwipe\(\$event, track\)"/);
assert.match(playlists, /class="playlist-song-remove"/);
assert.match(musicStore, /function removeFromPlaylist\(id: string, track: Track\)/);

console.log('PASS: settings isolation, API defaults, status-bar toggle and music swipe deletion are wired.');
