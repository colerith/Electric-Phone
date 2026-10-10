const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const backend = { musicBackend: { value: 'ready' }, checkMusicBackend: async () => {}, builtinMusicBase: p => `https://tavern.test/api/plugins/electric-phone-music/${p}`, isBuiltinMusicBase: b => b.startsWith('https://tavern.test/') };
function load(file, deps) {
 const m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(id => deps[id] || require(id),m,m.exports);
 return m.exports;
}
global.localStorage={getItem:()=>null};
global.SillyTavern={getRequestHeaders:()=>({'X-CSRF-Token':'test'})};
const accounts=load('services/music/music-accounts.ts',{'./music-backend':backend});
let handler;
global.fetch=async(url,opts)=>{
 assert.equal(opts.method,'POST');assert.equal(opts.headers['X-CSRF-Token'],'test');
 return {ok:true,json:async()=>handler(new URL(url).pathname,Object.fromEntries(opts.body))};
};
const music=load('services/music/music.ts',{
 './music-backend':backend,'./music-accounts':accounts,
 '../core/network':{fetchJson:async()=>{throw Error('old source offline');}},
 '../apps/browser':{safeBrowserUrl:s=>s},
});
(async()=>{
 const fixtures={
 netease:{code:200,result:{songs:[{id:1,name:'NE',ar:[{name:'Artist'}],al:{name:'Album',picUrl:'https://cover.test/ne'}}]}},
 qq:{response:{data:{song:{list:[{mid:'mid',name:'QQ',singer:[{name:'Artist'}],album:{mid:'album'}}]}}}},
 kugou:{status:1,data:{lists:[{FileHash:'hash',SongName:'KG',SingerName:'Artist',img:'https://cover.test/kg'}]}}
 };
 handler=(url,params)=>{
  const provider=url.split('/')[4];
  assert.equal(params.keywords||params.key,'hello');
  return fixtures[provider];
 };
 const states=[];
 const results=await music.searchMusic('hello','','aggregate',undefined,(rows,state)=>states.push(state));
 assert.deepEqual(results.map(r=>r.source),['builtin-netease','builtin-qq','builtin-kugou']);
 assert.deepEqual(results.map(r=>r.title),['NE','QQ','KG']);
 assert(results.every(r=>r.apiBase.startsWith('https://tavern.test/')));
 assert(states.at(-1).includes('暂不可用'),'failing old sources do not discard successful results');
 // A result remains playable through the same provider; no account cookie is required just to search.
 handler=(url,params)=>{assert(url.endsWith('/netease/song/url/v1'));assert.equal(params.id,'1');return {code:200,data:[{url:'https://audio.test/song.mp3'}]};};
 const playable=await music.resolveTrack(results[0],'');
 assert.equal(playable.url,'https://audio.test/song.mp3');assert.equal(playable.source,'builtin-netease');
 await assert.rejects(()=>accounts.resolveAccountTrack({...results[0],source:'account-netease'}),/登录/);
 backend.musicBackend.value='missing';
 await assert.rejects(()=>music.searchMusic('hello','','builtin-qq'),/重启/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>music.searchMusic('hello','','aggregate',controller.signal),{name:'AbortError'});
 console.log('Built-in search: all provider mappings, aggregation fallback, playback routing, login boundary and cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
