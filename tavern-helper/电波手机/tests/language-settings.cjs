const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
global._=require('lodash');global.z=require('zod').z;global.SillyTavern={name1:'User'};
const {buildModulePrompt,buildPhonePrompts,buildMomentsPrompt}=require('../prompts/index.ts');
const {ScriptSettingsSchema}=require('../schemas.ts');
const {MomentsStateSchema}=require('../services/space/moments.ts');
const input={cardKey:'card',chatKey:'chat',cardName:'Card',identity:{charKey:'alice',name:'Alice'},thread:{id:'thread',messages:[],historyArchive:[]},appSnapshot:{status:'',zone:'',memo:'',calendar:'',browse:'',wallet:'',music:''},outputLanguage:'英语',availableStickers:''};
for(const app of ['status','memo','calendar','browse','music','wallet'])for(const follow of [true,false]) {
 const prompt=buildModulePrompt(input,[app],follow);assert(prompt.includes('必须使用英语'),app);
 assert(prompt.includes('不约束酒馆正文'));
}
const bilingual=buildModulePrompt({...input,moduleSettings:{memo:{syncChat:false,autoTranslate:true,sourceLanguage:'日语',targetLanguage:'简体中文'}}},['memo'],false);
assert(bilingual.includes('日语 原文'));assert(bilingual.includes('简体中文 译文'));
assert(bilingual.includes('明确启用双语的 App'));
assert(buildPhonePrompts(input).some(p=>p.content?.includes('必须使用英语')));
const prefs=ScriptSettingsSchema.parse({}).appearance;assert.equal(prefs.outputLanguage,'简体中文');assert.equal(prefs.interfaceLanguage,'简体中文');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<main><button>设置</button><label>默认输出语言</label><input placeholder="搜索" value="用户原文"><p class="memo-paper-copy">设置</p></main>');
for(const k of ['document','NodeFilter','MutationObserver'])global[k]=dom.window[k];
const {interfaceText,bindInterfaceLanguage}=require('../services/core/interface-language.ts');
(async()=>{
 const root=document.querySelector('main');let language='英语';const stop=bindInterfaceLanguage(root,()=>language);
 assert.equal(root.querySelector('button').textContent,'Settings');
 assert.equal(root.querySelector('.memo-paper-copy').textContent,'设置');assert.equal(root.querySelector('input').value,'用户原文');
 for(const [lang,label] of [['日语','設定'],['韩语','설정'],['繁体中文','設置'],['简体中文','设置']]){language=lang;root.setAttribute('title','设置');await new Promise(r=>setTimeout(r,0));assert.equal(root.querySelector('button').textContent,label);}
 language='英语';const next=document.createElement('button');next.textContent='保存';root.append(next);await new Promise(r=>setTimeout(r,0));assert.equal(next.textContent,'Save');
 stop();console.log('PASS language defaults, all module routes, bilingual priority, offline UI switch/restore, new controls and user-content isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
