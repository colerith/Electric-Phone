const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const { parseStatusProfile } = require(base + '/services/apps/status.ts');
const { validateCommentLanguages } = require(base + '/services/space/comment-language.ts');
const parsed = parseStatusProfile(
  JSON.stringify({
    fav: 94.2,
    fav_delta: '+0.3',
    fav_reason: '被认真倾听',
    soc: 92,
    soc_delta: '-2',
    soc_reason: '紧张感缓解',
  }),
);
assert.equal(parsed.favor.description, '+0.3 · 被认真倾听');
assert.equal(parsed.desire.description, '-2 · 紧张感缓解');
assert.equal(
  parseStatusProfile('{"soc":90,"soc_delta":"+0","soc_reason":"心境稳定"}').desire.description,
  '+0 · 心境稳定',
);
assert.equal(
  parseStatusProfile('性欲指数：88\n性欲变化：-1\n性欲原因：注意力转移').desire.description,
  '-1 · 注意力转移',
);
const posts = [{ id: 'post', translation: { language: '简体中文', content: '晚安' } }];
const batch = { comments: [{ postId: 'post', authorKey: 'npc:one', content: 'Good night' }] };
assert.throws(() => validateCommentLanguages(batch, posts), /简体中文/);
batch.comments[0].translation = { language: '日语', content: 'おやすみ' };
assert.throws(() => validateCommentLanguages(batch, posts), /简体中文/);
batch.comments[0].translation = { language: '简体中文', content: '晚安' };
validateCommentLanguages(batch, posts);
batch.comments[0].translation = { language: '日语', content: 'おやすみ' };
validateCommentLanguages(batch, posts, {
  'npc:one': { autoTranslate: true, sourceLanguage: '英语', targetLanguage: '日语' },
});
console.log(
  'PASS status delta/reasons and legacy text; parent translation inheritance, missing/wrong translation and explicit override',
);
