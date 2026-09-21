const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const app = fs.readFileSync(path.join(root, 'app.vue'), 'utf8');
const credits = fs.readFileSync(path.join(root, 'components/settings/WaveCopyrightCredits.vue'), 'utf8');
const guide = fs.readFileSync(path.resolve('.wave-publish/Electric-Phone/README.md'), 'utf8');

assert.match(app, /<WaveCopyrightCredits v-else-if="settingsSection === 'credits'"/);
assert.match(app, /id: 'credits',[\s\S]*?name: '版权与致谢'/);
assert.match(credits, /原创开源的酒馆助手内置小手机脚本/);
assert.match(credits, /<strong>日月西 TA的手机<\/strong>脚本模块/);
assert.match(credits, /禁止[\s\S]*?二次传播与任何形式的商业化使用/);
assert.match(credits, /Ephone、糯米机、糯叽机、float、柏柏小手机/);
assert.match(credits, /discord\.com\/channels\/1291925535324110879\/1356554161713582123/);
assert.equal((credits.match(/class="wave-settings-title"/g) || []).length, 2);
assert.doesNotMatch(credits, /<h3>/);
assert.match(guide, /^# 电波手机使用指南/m);
for (const moduleName of ['消息', '状态', '备忘', '空间', '钱包', '日历', '浏览', '音乐']) {
  assert.match(guide, new RegExp(`^### ${moduleName}$`, 'm'));
}

console.log('PASS: copyright and credits settings page and modular user guide are wired.');
