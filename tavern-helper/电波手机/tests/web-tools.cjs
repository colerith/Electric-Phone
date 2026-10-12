const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
    file,
  );
const saved = new Map();
global.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
global.SillyTavern = {
  getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'local-only' }),
};
const filename = path.resolve(__dirname, '../services/web-tools.ts');
const reload = () => {
  delete require.cache[filename];
  return require(filename);
};
(async () => {
  let api = reload();
  let requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ content: [{ type: 'text', text: 'Result https://example.org' }] });
  };
  assert.equal(await api.searchChatContext('private chat'), '');
  assert.equal(requests.length, 0);
  api.webSettings.servers.push({
    id: 'one',
    name: 'Search',
    url: 'https://example.com/mcp',
    apiKey: 'test-secret',
    headers: '{}',
    enabled: true,
  });
  Object.assign(api.webSettings, {
    autoSearch: true,
    searchServer: 'one',
    searchTool: 'search',
    searchArguments: '{"query":"{{query}}"}',
  });
  api.saveWebSettings();
  api = reload();
  assert.equal(api.webSettings.servers[0].apiKey, 'test-secret');
  assert.equal(api.webSettings.autoSearch, true);
  const query = 'quoted "text"\nnext line';
  const context = await api.searchChatContext(query);
  assert.equal(requests[0].body.operation.arguments.query, query);
  assert.equal(context.includes('test-secret'), false);
  assert.match(context, /仅作事实参考/);
  assert.deepEqual(
    api.extractWebLinks('看看 https://example.com/a。 和 https://example.com/a。 https://example.org/b)'),
    ['https://example.com/a', 'https://example.org/b'],
  );
  assert.deepEqual(api.toolArguments('{"urls":["{{query}}"],"n":2}', query), { urls: [query], n: 2 });
  global.fetch = async () => Response.json({ message: 'unavailable' }, { status: 502 });
  assert.equal(await api.searchChatContext('retry'), '');
  assert.match(api.webToolsStatus.lastSearch, /继续聊天/);
  global.fetch = async () => {
    requests.push('preview');
    return Response.json({ title: 'Cached' });
  };
  requests = [];
  const result = await Promise.all([
    api.getLinkPreview('https://example.com'),
    api.getLinkPreview('https://example.com'),
  ]);
  assert.equal(requests.length, 1);
  assert.equal(result[1].title, 'Cached');
  await api.getLinkPreview('https://example.com', true);
  assert.equal(requests.length, 2);
  saved.set('wave-phone-web-tools-v1', '{bad json');
  assert.equal(reload().webSettings.autoSearch, false);
  console.log(
    'web tools: defaults, persistence, exact arguments, retrieval failure, URL extraction and preview dedup passed',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
