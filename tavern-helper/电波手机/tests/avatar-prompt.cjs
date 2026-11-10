const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const path = require('node:path');
const source = path.join(__dirname, '../services/image/avatar-prompt.ts');
const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod.exports);
const { avatarPrompt, AVATAR_NEGATIVE } = mod.exports;
const identity = 'Current character: silver hair, green eyes, facial scar';
for (const supplement of ['', 'blue coat, sunset', 'replace with a black-haired stranger']) {
  const result = avatarPrompt(identity, supplement);
  assert.ok(result.includes(identity), 'supplements must never remove identity');
  assert.ok(result.includes(supplement));
  assert.match(result, /Ignore conflicting supplemental details/);
  assert.match(result, /1024 x 1024/);
  assert.match(result, /circular cropping/);
  assert.match(result, /No text/);
}
assert.doesNotMatch(avatarPrompt('Friends group', 'stars', true), /head and shoulders/);
assert.match(AVATAR_NEGATIVE, /watermark/);
const component = fs.readFileSync(path.join(__dirname, '../components/shared/WaveAvatarGenerator.vue'), 'utf8');
assert.match(component, /avatarPrompt\(avatarFallback/);
assert.match(component, /width: props.purpose === 'avatar' \? 1024 : 1536/);
assert.match(component, /height: 1024/);
assert.match(component, /selected.negative, AVATAR_NEGATIVE/);
console.log('avatar prompt: identity retention, conflicting additions, crop, dimensions and exclusions passed');
