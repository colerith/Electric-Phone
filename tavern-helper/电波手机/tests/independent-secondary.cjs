const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,f);
global.z=require('zod').z;global._=require('lodash');
global.SillyTavern={chat:[{swipe_id:0}],getRequestHeaders:()=>({'Content-Type':'application/json'}),powerUserSettings:{persona_description:'User profile'}};
global.getCharData=()=>({data:{description:'Card description',personality:'Personality'}});
global.generateRaw=()=>{throw Error('Must not enter host generation');};
const {saveSecondaryResult,withSecondaryResults,SecondaryResultsSchema}=require('../services/generation/secondary-results.ts');
const {independentMessages,requestIndependentApi}=require('../services/generation/independent-api.ts');
const {ScriptSettingsSchema}=require('../schemas.ts');
const {buildCustomApi}=require('../services/core/api-config.ts');
(async()=>{
 const floor={message_id:0,role:'assistant',message:'Original narrative'};
 let saved={};saveSecondaryResult(saved,floor,'<wave_phone_delta>{}</wave_phone_delta>');
 saved=SecondaryResultsSchema.parse(JSON.parse(JSON.stringify(saved)));
 assert(withSecondaryResults([floor],saved)[0].message.includes('wave_phone_delta'));
 assert.equal(floor.message,'Original narrative');
 assert.equal(withSecondaryResults([{...floor,message:'Edited'}],saved)[0].message,'Edited');
 SillyTavern.chat[0].swipe_id=1;
 assert.equal(withSecondaryResults([floor],saved)[0].message,floor.message);
 SillyTavern.chat[0].swipe_id=0;
 assert(withSecondaryResults([floor],saved)[0].message.includes('wave_phone_delta'));
 assert.deepEqual(withSecondaryResults([],saved),[]);
 const settings=ScriptSettingsSchema.parse({sendMode:'secondary_api',api:{enabled:true,apiurl:'https://example.invalid/custom',key:'test-key',model:'model'}});
 const messages=independentMessages(settings,['char_description','persona_description','chat_history',{role:'system',content:'Task'},'user_input'],{chat_history:{prompts:[{role:'assistant',content:'Story<wave_phone_delta>{}</wave_phone_delta>'}]}},'Update now');
 assert(messages.some(m=>m.content==='Card description'));
 assert(messages.some(m=>m.content==='User profile'));
 assert(messages.some(m=>m.content==='Story'));
 let sent;
 global.fetch=async(url,opts)=>{assert.equal(url,'/api/backends/chat-completions/generate');sent=JSON.parse(opts.body);return Response.json({choices:[{message:{content:'result'}}]});};
 assert.equal(await requestIndependentApi(settings,buildCustomApi(settings),messages,new AbortController().signal),'result');
 assert.equal(sent.reverse_proxy,'https://example.invalid/custom');
 assert.equal(sent.proxy_password,'test-key');
 settings.api.stream=true;
 global.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n'));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 assert.equal(await requestIndependentApi(settings,buildCustomApi(settings),messages,new AbortController().signal),'hello');
 // Reproduce mislabeled/missing SSE headers and byte-split UTF-8/chunks.
 for (const headers of [{}, {'Content-Type':'application/json'}, {'Content-Type':'text/plain'}]) {
  const bytes=new TextEncoder().encode(': heartbeat\r\nevent: message\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]');
  global.fetch=async()=>new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}}),{headers});
  assert.equal(await requestIndependentApi(settings,buildCustomApi(settings),messages,new AbortController().signal),'你好');
 }
 global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'JSON fallback'}}]}),{headers:{'Content-Type':'text/event-stream'}});
 assert.equal(await requestIndependentApi(settings,buildCustomApi(settings),messages,new AbortController().signal),'JSON fallback');
 global.fetch=async()=>new Response('data: {"error":{"message":"provider failure"}}\n\n', {headers:{'Content-Type':'application/json'}});
 await assert.rejects(requestIndependentApi(settings,buildCustomApi(settings),messages,new AbortController().signal),/provider failure/);
 global.fetch=async(_url,opts)=>{opts.signal.throwIfAborted();throw Error('should abort');};
 const abort=new AbortController();abort.abort();
 await assert.rejects(requestIndependentApi(settings,buildCustomApi(settings),messages,abort.signal),{name:'AbortError'});
 console.log('PASS independent request, explicit context, SSE, abort, unchanged narrative, persisted sidecar, edit/swipe/delete isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
