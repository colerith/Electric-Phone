const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const { ref, computed, effectScope } = require('vue');
const { useChatPagination } = require(path.resolve(__dirname, '../services/chat/chat-pagination.ts'));
const scope = effectScope();
scope.run(() => {
  const rows = ref(Array.from({ length: 251 }, (_, index) => ({ id: String(index) })));
  const page = useChatPagination(computed(() => rows.value));
  assert.equal(page.visible.value.length, 100);
  assert.equal(page.visible.value[0].id, '151');
  page.loadMore();
  assert.equal(page.visible.value.length, 200);
  assert.equal(page.visible.value[0].id, '51');
  rows.value.push({ id: '251' });
  assert.equal(page.visible.value[0].id, '51', '新消息不能挤走当前阅读起点');
  page.loadMore();
  assert.equal(page.visible.value.length, 252);
  assert.equal(page.hasMore.value, false);
  page.reset();
  assert.equal(page.visible.value.length, 100);
  assert.equal(page.visible.value.at(-1).id, '251');
  rows.value = [];
  assert.equal(page.visible.value.length, 0);
  rows.value = Array.from({ length: 300 }, (_, index) => ({ id: 'next-' + index }));
  assert.equal(page.visible.value.length, 100, '异步载入新会话仍只显示最新100条');
  assert.equal(page.visible.value[0].id, 'next-200');
  rows.value = [{ id: 'short' }];
  assert.equal(page.visible.value.length, 1);
  assert.equal(page.hasMore.value, false);
});
scope.stop();
console.log('PASS: 100-row pages, partial oldest page, append anchor, reset and asynchronous conversation switch');
