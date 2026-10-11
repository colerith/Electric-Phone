const fs = require('fs'), ts = require('typescript'), assert = require('node:assert/strict');
global._ = require('lodash');
global.z = require('zod').z;
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, f);
const { mergeLimitedModule, moduleSnapshot } = require('../services/generation/module-updates.ts');
const item = id => ({ id, content: id, title: id });
let memo = mergeLimitedModule('memo', '', { notes: [item('note')], doodles: [item('a'), item('b')] });
memo = mergeLimitedModule('memo', memo, { doodles: [item('c'), item('d')] });
const snapshot = () => moduleSnapshot({ memo, zone: '', calendar: '', browse: '' });
assert.deepEqual(JSON.parse(snapshot().memo).doodles.map(x => x.id), ['c', 'd']);
assert.equal(JSON.parse(memo).doodles.length, 4, 'full local history retained');
assert.equal(JSON.parse(snapshot().memo).notes.length, 1, 'notes unaffected');
memo = mergeLimitedModule('memo', memo, { notes: [item('other')] });
assert.deepEqual(JSON.parse(snapshot().memo).doodles.map(x => x.id), ['c', 'd']);
memo = mergeLimitedModule('memo', memo, { doodles: [{ ...item('a'), content: 'revised' }] });
assert.deepEqual(JSON.parse(snapshot().memo).doodles.map(x => x.id), ['a'], 'revised old ID is the newest layer');
memo = JSON.stringify({ notes: [], doodles: [item('legacy1'), item('legacy2')] });
assert.deepEqual(JSON.parse(snapshot().memo).doodles.map(x => x.id), ['legacy2'], 'legacy history uses last item when layer metadata unavailable');
assert.equal(JSON.parse(memo).doodles.length, 2);
console.log('PASS: latest doodle batch, revisions, notes-only updates, legacy fallback and local preservation');
