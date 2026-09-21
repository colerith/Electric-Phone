const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const upload = read('components/shared/WaveImageUpload.vue');
const home = read('styles/apps/home.scss');
const moments = read('styles/apps/moments.scss');
const space = read('styles/apps/space.scss');
const messenger = read('styles/apps/messenger.scss');
const settings = read('styles/settings/settings.scss');
const systemSettings = read('styles/settings/system-settings.scss');
const style = read('styles/base/style.scss');
const npcProfile = read('components/space/WaveNpcProfile.vue');
const generationIsland = read('components/shell/WaveGenerationIsland.vue');

assert.match(upload, /'is-avatar': purpose === 'avatar'/);
assert.match(upload, /'avatar-preview': purpose === 'avatar'/);
assert.match(home, /\.anniversary-portraits\s*\{[\s\S]*?container-type: inline-size;/);
assert.match(home, /\.anniversary-avatar\s*\{[\s\S]*?width: 55%;[\s\S]*?height: 55cqw;/);
assert.match(home, /\.ios-home-dock\s*\{[\s\S]*?grid-template-columns: repeat\(4, calc\(\(100% - 36px\) \/ 4 \+ 3px\)\);[\s\S]*?gap: 12px;[\s\S]*?padding: 9px 4px;/);
assert.match(home, /\.ios-home-dock \.ios-app-icon\s*\{[\s\S]*?place-items: center;[\s\S]*?justify-self: stretch;[\s\S]*?transform: translateX\(4px\);/);
assert.doesNotMatch(home, /\.ios-home-dock\s*\{[\s\S]*?grid-template-columns: repeat\(3,/);
assert.match(moments, /\.moments-avatar\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(moments, /\.moment-author-avatar\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(
  space,
  /\.space-comment-avatar\s*\{[\s\S]*?width: 30px;[\s\S]*?height: 30px;[\s\S]*?flex: 0 0 30px;[\s\S]*?border-radius: 50% !important;/,
);
assert.match(space, /\.space-comment-avatar img\s*\{[\s\S]*?border-radius: 50% !important;/);
assert.match(moments, /\.moments-profile-avatar img\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(settings, /\.chat-profile-settings \.wave-image-preview\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(style, /\.wave-image-upload\.is-avatar \.wave-image-preview\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(style, /\.wave-upload-preview\.avatar-preview[\s\S]*?border-radius: 50%;/);
assert.match(
  systemSettings,
  /\.wave-image-modal \.wave-upload-preview\.avatar-preview\s*\{[\s\S]*?width: min\(100%, 230px\);[\s\S]*?aspect-ratio: 1 \/ 1;[\s\S]*?border-radius: 50%;/,
);
assert.doesNotMatch(messenger, /clip-path: circle/);
assert.match(messenger, /\.messenger-avatar\s*\{[\s\S]*?min-width: 42px;[\s\S]*?max-height: 42px;/);
assert.match(messenger, /\.messenger-avatar img\s*\{[\s\S]*?object-position: center;[\s\S]*?border-radius: 0 !important;/);
assert.match(messenger, /\.wave-device \.messenger-avatar\s*\{[\s\S]*?overflow: hidden;/);
assert.match(npcProfile, /\.npc-profile-avatar\s*\{[\s\S]*?border-radius: 50%;/);
assert.match(generationIsland, /moments: '空间'/);

console.log(
  'PASS: profile, moments, comments, messenger and character-setting avatars use consistent circular crops; manual Moments generation is labeled Space.',
);
