import { createAvatar } from '@dicebear/core';
import * as styles from '@dicebear/collection';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const output = path.resolve(process.argv[2]);
const groups = {
  world: ['adventurer','bigEars','croodles','funEmoji','lorelei','micah','notionists','openPeeps','personas','pixelArt','shapes','thumbs'],
  anonymous: ['identicon','rings','shapes','pixelArtNeutral','loreleiNeutral','thumbs'],
};
const palette = ['dce7f3','e7def2','f2dfdf','dfe9db','f5e6cc','dde8e8'];
const manifest = { version: 1, generator: 'DiceBear 9.4.2', size: 240, assets: [], styles: {} };
const hashes = new Set();
for (const [group,names] of Object.entries(groups)) {
  await mkdir(path.join(output,group),{recursive:true});
  for (const name of names) {
    const style=styles[name];
    if (!['CC0 1.0','CC BY 4.0'].includes(style.meta.license.name)) throw Error('Unsupported license');
    manifest.styles[name]=style.meta;
    for(let index=0;index<(group==='world'?20:12);index++) {
      let seed, buffer, hash, attempt=0;
      do {
        seed=`electric-phone-v1-${group}-${name}-${index}-${attempt++}`;
        const svg=createAvatar(style,{seed,size:240,backgroundColor:palette}).toString();
        buffer=await sharp(Buffer.from(svg)).webp({quality:85}).toBuffer();
        hash=createHash('sha256').update(buffer).digest('hex');
      } while(hashes.has(hash) && attempt<100);
      if(hashes.has(hash)) throw Error('Duplicate image');
      hashes.add(hash);
      const file=`${group}/${name}-${String(index).padStart(2,'0')}.webp`;
      await writeFile(path.join(output,file),buffer);
      manifest.assets.push({file,style:name,seed,sha256:hash});
    }
  }
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(output,'ATTRIBUTION.md'),`# Electric Phone avatar library v1\n\n312 images generated locally with DiceBear 9.4.2 (240 world avatars, 72 anonymous avatars). These are not Pinterest downloads or official Discord defaults. Styles are remixes by DiceBear of the artists' original works. Changes: seeded combinations, pastel background, rasterized/resized to 240px WebP. Individual seeds and hashes are in manifest.json.\n\nThe artwork retains its original CC0 / CC BY 4.0 terms; Electric Phone's usage restrictions do not apply to these assets. No artist endorsement is implied.\n\n`+Object.entries(manifest.styles).map(([name,m])=>`- **${m.title}** — ${m.creator}; [original work](${m.source}); [${m.license.name}](${m.license.url}); [DiceBear style](https://www.dicebear.com/styles/${name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}/)`).join('\n')+'\n');
console.log(`Generated ${manifest.assets.length} unique avatars into ${output}`);
