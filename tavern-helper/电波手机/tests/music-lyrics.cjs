const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require('jsdom');global.DOMParser=new JSDOM('').window.DOMParser;
const code=ts.transpileModule(fs.readFileSync(path.resolve('src/util/酒馆助手脚本/电波手机/services/music/music-lyrics.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('require','module','exports',code)(()=>({}),m,m.exports);
const result=m.exports.ttmlToLrc('<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><p begin="00:01.250"><span>Hello</span><span ttm:role="x-translation">你好</span></p><p begin="65000ms">World</p></body></tt>');
assert.equal(result,'[00:01.25]Hello\n[01:05.00]World');assert.equal(m.exports.ttmlToLrc('<invalid'), '');
console.log('PASS: AMLL TTML timing conversion and translation separation');

assert.equal(m.exports.ttmlToLrc('<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><p begin="1s">Hi<span ttm:role="x-translation">你好</span><span ttm:role="x-romanization">ni hao</span></p></tt>', 'romanization'),'[00:01.00]ni hao');
