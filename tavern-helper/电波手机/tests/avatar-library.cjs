const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const source=path.resolve(__dirname,'../services/space/npc-avatar.ts');
const release=fs.existsSync(path.resolve(__dirname,'../../..','assets/avatars/v1'))?path.resolve(__dirname,'../../..'):path.resolve('.wave-publish/Electric-Phone');
const root=path.join(release,'assets/avatars/v1');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const code=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(native) {
 const m={exports:{}};
 new Function('require','module','exports','__WAVE_PHONE_MODULE_URL__',code)(()=>({isExtensionRuntime:native}),m,m.exports,'https://tavern.test/scripts/extensions/third-party/custom-folder/dist/index.js');
 return m.exports;
}
const lib=load(true),web=load(false),files=new Set(manifest.assets.map(a=>a.file));
assert.equal(files.size,312);assert.equal([...files].filter(f=>f.startsWith('world/')).length,240);
for(const row of manifest.assets){
 const bytes=fs.readFileSync(path.join(root,row.file));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert(['CC0 1.0','CC BY 4.0'].includes(manifest.styles[row.style].license.name));
}
const worlds=new Set(),anonymous=new Set();
for(let i=0;i<20000;i++){
 const seed=`user-${i}`;
 for(const [url,group] of [[lib.spaceAvatarUrl(seed),'world'],[lib.anonymousLibraryAvatarUrl(seed),'anonymous']]){
  assert(url.startsWith('https://tavern.test/scripts/extensions/third-party/custom-folder/assets/avatars/v1/'));
  const relative=url.split('/v1/')[1];assert(files.has(relative));assert(relative.startsWith(group+'/'));
  (group==='world'?worlds:anonymous).add(relative);
 }
 assert.equal(lib.npcAvatarUrl(seed),lib.spaceAvatarUrl(seed));
}
assert.equal(worlds.size,240);assert.equal(anonymous.size,72);
assert.equal(lib.spaceAvatarUrl('stable'),lib.spaceAvatarUrl(' stable '));
assert(web.spaceAvatarUrl('x').startsWith('https://cdn.jsdelivr.net/gh/colerith/Electric-Phone@v1.3.12/'));
console.log('Avatar library: 312 unique licensed WebP assets, all reachable, stable identities, separate anonymous pool and renamed extension path passed');
