const fs = require('fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    f,
  );
const { stickerPrompt, resolveStickerMessage } = require('../services/chat/stickers.ts');
const { formatPhoneMessage } = require('../services/chat/message-format.ts');
const image = 'data:image/png;base64,' + 'A'.repeat(3457215);
const stickers = [
  { id: 'local', name: '开心', url: image, scope: 'global' },
  { id: 'private', name: '专属', url: image, scope: 'char', charKey: 'a' },
  { id: 'remote', name: '远程', url: 'https://example.com/a.png', scope: 'global' },
];
const privatePrompt = stickerPrompt({ charKey: 'a' }, stickers);
const groupPrompt = stickerPrompt({ source: 'local_group', memberKeys: ['a', 'b'] }, stickers);
for (const prompt of [privatePrompt, groupPrompt]) {
  assert(prompt.length < 1000);
  assert(!prompt.includes('base64') && !prompt.includes('AAAA') && !prompt.includes('https://'));
  assert(prompt.includes('开心') && prompt.includes('专属'));
}
const reply = url => ({ type: 'emoji', content: '开心', payload: { emojiType: 'sticker', url } });
const restored = resolveStickerMessage(reply('sticker://local'), 'b', stickers);
assert.equal(restored.payload.url, image);
assert.equal(restored.payload.stickerId, 'local');
assert(formatPhoneMessage(restored).length < 200, '回复写入历史后也不能泄漏图片数据');
assert.equal(resolveStickerMessage(reply('sticker://private'), 'a', stickers).payload.url, image);
assert.equal(resolveStickerMessage(reply('sticker://private'), 'b', stickers).payload.url, undefined);
assert.equal(resolveStickerMessage(reply('sticker://deleted'), 'a', stickers).payload.url, undefined);
assert.equal(resolveStickerMessage(reply('sticker://remote'), 'a', stickers).payload.url, stickers[2].url);
assert.equal(
  resolveStickerMessage(reply('https://example.com/legacy.png'), 'a', stickers).payload.url,
  'https://example.com/legacy.png',
);
assert.equal(stickers[0].url, image, '生成提示词不能修改上传资源');
assert.equal(stickerPrompt({ charKey: 'a' }, []), '');
console.log('sticker context regression passed');
