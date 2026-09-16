const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const upload = read('components/WaveImageUpload.vue');
const home = read('home.scss');
const moments = read('moments.scss');
const messenger = read('messenger.scss');
const settings = read('settings.scss');
const style = read('style.scss');
const npcProfile = read('components/WaveNpcProfile.vue');

assert.match(upload, /'is-avatar': purpose === 'avatar'/);
assert.match(upload, /'avatar-preview': purpose === 'avatar'/);
assert.match(home, /\.anniversary-portraits\s*\{[\s\S]*?container-type: inline-size;/);
assert.match(home, /\.anniversary-avatar\s*\{[\s\S]*?width: 55%;[\s\S]*?height: 55cqw;/);
assert.match(moments, /\.moments-avatar\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(moments, /\.moment-author-avatar\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(moments, /\.moments-profile-avatar img\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(settings, /\.chat-profile-settings \.wave-image-preview\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(style, /\.wave-image-upload\.is-avatar \.wave-image-preview\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(style, /\.wave-upload-preview\.avatar-preview[\s\S]*?border-radius: 50%;/);
assert.doesNotMatch(messenger, /clip-path: circle/);
assert.match(messenger, /\.messenger-avatar\s*\{[\s\S]*?min-width: 42px;[\s\S]*?max-height: 42px;/);
assert.match(messenger, /\.messenger-avatar img\s*\{[\s\S]*?object-position: center;/);
assert.match(npcProfile, /\.npc-profile-avatar\s*\{[\s\S]*?border-radius: 50%;/);

console.log('PASS: profile, moments, messenger and character-setting avatars use consistent circular crops.');
