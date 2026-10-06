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
const { parseJsonResponse } = require('../services/generation/json-response.ts');
assert.deepEqual(parseJsonResponse('{"text":"a\nb","x":[1,2,],}'), { text: 'a\nb', x: [1, 2] });
assert.deepEqual(parseJsonResponse('{"text":",} stays unchanged"}'), { text: ',} stays unchanged' });
assert.throws(() => parseJsonResponse('{"text":"unfinished'), SyntaxError);
assert.throws(() => parseJsonResponse('{"text":"say "hello" now"}'), SyntaxError);
assert.throws(() => parseJsonResponse('{"x":1 "y":2}'), SyntaxError);
console.log('PASS safe trailing comma/control-character repair; ambiguous and truncated JSON rejected');
