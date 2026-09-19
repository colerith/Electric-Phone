const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const app = fs.readFileSync(path.join(root, 'app.vue'), 'utf8');
const messagesStyle = fs.readFileSync(path.join(root, 'styles/apps/messages.scss'), 'utf8');

assert.match(app, /class="message-row char typing-row"/);
assert.match(messagesStyle, /\.message-row \.wave-message-text\s*{[\s\S]*?border-radius:\s*2px 21px 21px 21px;/);
assert.match(
  app,
  /hidden\.delete\(id\);[\s\S]*?hiddenMessageIds\.value = hidden;[\s\S]*?if \(message\?\.sender === 'char'\) sound\('message'\);/,
);
assert.match(app, /!hiddenMessageIds\.value\.has\(id\) && !revealQueue\.includes\(id\)/);

console.log('PASS: typing bubble inherits the char bubble shape and each revealed char message triggers sound.');
