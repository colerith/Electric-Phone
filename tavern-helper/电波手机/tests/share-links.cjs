const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
    f,
  );
const { parseSharedLinks } = require('../services/chat/share-links.ts');
const { editedMessagePayload } = require('../services/chat/message-format.ts');
const url =
  'https://www.xiaohongshu.com/discovery/item/6aba080f0000000002028cc3?source=webshare&xhsshare=pc_web&xsec_token=keep+token=&xsec_source=pc_share';
const share = `11 【在巴厘岛亲眼见到了iPhone壁纸取景地📸 - O泡果奶🥛 | 小红书 - 你的生活兴趣社区】 😆 psQGBKuxCElhOBg 😆 ${url}`;
const parsed = parseSharedLinks(share);
assert.deepEqual(parsed, [{ url, title: '在巴厘岛亲眼见到了iPhone壁纸取景地📸', siteName: '小红书' }]);
assert.equal(parseSharedLinks('【测试视频-哔哩哔哩】 b23.tv/abc123。')[0].url, 'https://b23.tv/abc123');
assert.equal(parseSharedLinks('BV1GJ411x7h7')[0].url, 'https://www.bilibili.com/video/BV1GJ411x7h7');
assert.equal(parseSharedLinks('av170001')[0].url, 'https://www.bilibili.com/video/av170001');
assert.equal(parseSharedLinks('xhslink.com/a/abc')[0].siteName, '小红书');
assert.equal(
  parseSharedLinks('xhsdiscover://item/discovery.6aba080f0000000002028cc3?xsec_token=keep=')[0].url,
  'https://www.xiaohongshu.com/explore/6aba080f0000000002028cc3?xsec_token=keep=',
);
assert.equal(parseSharedLinks('bilibili://video/170001')[0].url, 'https://www.bilibili.com/video/av170001');
assert.equal(parseSharedLinks('https://example.com/?a=1&amp;b=2')[0].url, 'https://example.com/?a=1&b=2');
assert.deepEqual(parseSharedLinks('javascript:alert(1) file:///etc/passwd xhsdiscover://home 😆 口令 😆'), []);
assert.deepEqual(parseSharedLinks('https://name:secret@example.com'), []);
const two = parseSharedLinks('【第一条】 https://example.com/1 【第二条】 https://example.com/2');
assert.deepEqual(
  two.map(link => link.title),
  ['第一条', '第二条'],
);
const updated = editedMessagePayload({ type: 'link', payload: { url: 'https://old.example', title: 'old' } }, share);
assert.equal(updated.url, url);
assert.equal(updated.title, parsed[0].title);
assert.equal(updated.shareText, share);
const titleOnly = editedMessagePayload({ type: 'link', payload: updated }, '新的标题');
assert.equal(titleOnly.url, url);
assert.equal(titleOnly.title, '新的标题');
assert.equal(titleOnly.shareText, undefined);
console.log('PASS: social share titles, signed URLs, short links, BV/av, app links and edited URLs');
