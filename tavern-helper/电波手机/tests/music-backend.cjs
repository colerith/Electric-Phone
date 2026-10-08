const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.SillyTavern={getRequestHeaders:()=>({'X-CSRF-Token':'test-token','Content-Type':'application/json'})};
const filename=path.resolve('src/util/酒馆助手脚本/电波手机/services/music/music-accounts.ts');
const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};
new Function('require','module','exports',code)(id=>id==='./music-backend'?{isBuiltinMusicBase:()=>true}:require(id),m,m.exports);
let calls=0;
global.fetch=async(url,options)=>{
 calls++; assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');
 assert.equal(options.headers['X-CSRF-Token'],'test-token');assert.equal(options.headers['X-QQ-Session'],undefined);
 assert.equal(new URL(url).search,'');assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');
 const params=Object.fromEntries(options.body);
 return {ok:true,json:async()=>url.endsWith('/key')?{code:200,data:{unikey:'key'}}:{code:200,data:{qrimg:'data:image/png;base64,AAAA'}}};
};
(async()=>{
 for(const provider of ['netease','qq','kugou']){
  const qr=await m.exports.createMusicQr(provider,'http://localhost/api/plugins/electric-phone-music/'+provider,'qq');
  assert.equal(qr.key,'key');assert.ok(qr.image);
 }
 assert.equal(calls,6);console.log('PASS: built-in music transport uses authenticated CSRF-protected POST for all providers');
})().catch(e=>{console.error(e);process.exitCode=1;});
