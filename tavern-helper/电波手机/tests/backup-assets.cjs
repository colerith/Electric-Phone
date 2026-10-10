const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );
const server=require('./resource-server.cjs');
const {packBackupAssets,unpackBackupAssets}=require('../services/core/backup-assets.ts');
const {storeResource}=require('../services/core/resource-storage.ts');
(async()=>{
 const image='data:image/png;base64,'+btoa('test image bytes');
 const path=await storeResource(image);
 const original={format:'wave-phone-backup',formatVersion:2,modules:{zone:{cover:path,other:[path,'中文与换行\n保持原样'],nested:JSON.stringify({image:path})}}};
 const packed=await packBackupAssets(original);
 assert.equal(Object.keys(packed.files).length,1);assert.equal(packed.data.assets.length,1);
 const json=JSON.stringify(packed.data);assert(!json.includes('base64'));assert(!json.includes(path));
 const uploads=server.uploads;
 await unpackBackupAssets(JSON.parse(json),packed.files,1024,false);assert.equal(server.uploads,uploads,'inspect never writes files');
 // A fresh runtime/server has no original files or in-memory existence cache.
 server.files.clear();
 delete require.cache[require.resolve('../services/core/resource-storage.ts')];
 delete require.cache[require.resolve('../services/core/backup-assets.ts')];
 const freshUnpack=require('../services/core/backup-assets.ts').unpackBackupAssets;
 const restored=await freshUnpack(JSON.parse(json),packed.files,1024);
 assert.equal(server.uploads,uploads+1,'restore uploads the binary on a different server');
 assert.deepEqual(restored,original);assert.equal(server.files.get(restored.modules.zone.cover).toString(),'test image bytes');
 await assert.rejects(unpackBackupAssets(JSON.parse(json),{},1024),/缺少资源/);
 await assert.rejects(unpackBackupAssets(JSON.parse(json),packed.files,1),/资源过大/);
 const legacy={format:'wave-phone-backup',formatVersion:3,payloadFormatVersion:1,cover:'assets/1.png',assets:[{path:['cover'],file:'assets/1.png',prefix:'data:image/png;base64,'}]};
 const upgraded=await unpackBackupAssets(legacy,{'assets/1.png':Buffer.from('test image bytes')},1024);
 assert.equal(upgraded.cover,path);assert.equal(upgraded.formatVersion,1);
 legacy.assets[0].path=['__proto__','polluted'];await assert.rejects(unpackBackupAssets(legacy,{'assets/1.png':Buffer.from('test image bytes')},1024),/路径无效/);
 assert.equal({}.polluted,undefined);
 const builtin='/scripts/extensions/custom-folder/assets/resources/'+'a'.repeat(64)+'.png';
 global.fetch=async url=>{assert.equal(url,builtin);return new Response('built-in pixels',{headers:{'Content-Type':'image/png'}});};
 const built=await packBackupAssets({format:'wave-phone-backup',formatVersion:2,cover:builtin});
 assert.equal(built.data.assets.length,1,'selected bundled artwork is portable across extension folders');
 const restoredBuilt=await freshUnpack(built.data,built.files,1024);
 assert.equal(server.files.get(restoredBuilt.cover).toString(),'built-in pixels');

 console.log('PASS portable binary v4 archive, deduplication, nested JSON, inspection without uploads, v3 migration and invalid assets');
})().catch(e=>{console.error(e);process.exitCode=1});
