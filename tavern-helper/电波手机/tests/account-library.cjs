const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve('src/util/酒馆助手脚本/电波手机');
const code=ts.transpileModule(fs.readFileSync(path.join(root,'services/music/account-library.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('require','module','exports',code)(()=>({accountBase:s=>s.replace(/\/$/,'')}),m,m.exports);
const {synchronizeLibrary,libraryKey}=m.exports;
(async()=>{
 global.indexedDB=require(require.resolve('fake-indexeddb',{paths:[path.resolve('.wave-publish/Electric-Phone')]})).indexedDB;
 const edits={test:{name:'本地名字',cover:'cover',removed:['account-qq:1']},hidden:{deleted:true}};
 await m.exports.writeLibraryOverrides('account-a',edits);
 assert.deepEqual(await m.exports.readLibraryOverrides('account-a'),edits,'local edits survive DB close and reopen');
 assert.deepEqual(await m.exports.readLibraryOverrides('account-b'),{},'edits isolated by account');
 await Promise.all([m.exports.writeLibraryOverrides('account-a',{test:{name:'旧'}}),m.exports.writeLibraryOverrides('account-a',edits)]);
 assert.deepEqual(await m.exports.readLibraryOverrides('account-a'),edits,'latest queued save wins');

 const controller=new AbortController();let active=0,peak=0;
 const api={
  lists:async(_p,_b,_u,offset)=>({lists:[{id:String(offset),name:'同名歌单',cover:'',owned:true}],next:offset+1,more:offset===0}),
  tracks:async(_p,_b,list,offset)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return {tracks:[{id:String(offset),title:'歌曲',source:'account-qq',url:'temporary',lyric:'text'}],next:offset+1,more:offset===0};},
 };
 const first=await synchronizeLibrary('qq','https://api.example','a',[],controller.signal,()=>{},api);
 assert.equal(first.rows.length,2);assert.equal(first.rows[0].tracks.length,2);assert.equal(first.rows[0].tracks[0].url,'');assert.ok(peak<=2);
 const row=first.rows[0], apply=m.exports.applyPlaylistOverride;
 assert.equal(apply(row,{name:'我的名字'}).name,'我的名字');
 assert.equal(apply(row,{deleted:true}),null);
 assert.equal(apply(row,{removed:['account-qq:0']}).tracks.length,1);
 const excluded=await synchronizeLibrary('qq','https://api.example','a',first.rows,controller.signal,()=>{},{...api,lists:async()=>({lists:[{id:'saved',owned:false}],more:false})});
 assert.equal(excluded.rows.length,0,'collected lists excluded');
 const second=await synchronizeLibrary('qq','https://api.example','a',first.rows,controller.signal,()=>{},api);
 assert.deepEqual(second.rows,first.rows,'stable IDs prevent duplicate imports');
 const other=await synchronizeLibrary('qq','https://api.example','b',[],controller.signal,()=>{},api);
 assert.notEqual(other.rows[0].id,first.rows[0].id,'accounts with same playlist IDs remain isolated');
 const failed=await synchronizeLibrary('qq','https://api.example','a',first.rows,controller.signal,()=>{},{...api,tracks:async()=>{throw Error('offline');}});
 assert.equal(failed.failed,2);assert.deepEqual(failed.rows,first.rows,'failed pages do not erase existing tracks');
 await assert.rejects(synchronizeLibrary('qq','https://api.example','a',first.rows,controller.signal,()=>{},{...api,lists:async()=>({lists:[],next:0,more:true})}),/分页/);
 controller.abort();await assert.rejects(synchronizeLibrary('qq','https://api.example','a',first.rows,controller.signal,()=>{},api));
 console.log('PASS: complete automatic pagination, bounded concurrency, stable source IDs, account isolation, cancellation and retained cache on failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
