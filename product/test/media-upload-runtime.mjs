import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SixteenMemory } from '../sdk/client.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const folder=await mkdtemp(join(tmpdir(),'sixteen-media-upload-'));
const owner='synthetic-media-owner-012345678901234567890';
let calls=0, mf;
const provider=async request=>{
 calls++; const b=await request.json(), part=b.messages[1].content[0];
 const url=part.video_url?.url??part.input_audio.data;
 assert.match(url,/^https:\/\/fixture.local\/v1\/media\/files\//);
 const clip=await mf.dispatchFetch(url,{headers:{Range:'bytes=0-15'}});
 assert.equal(clip.status,206);assert.equal((await clip.arrayBuffer()).byteLength,16);
 const value={complete:true,segments:[{id:'s1',start_ms:1000,end_ms:1500,speaker:null,kind:'speech',text:'A plan was proposed.'}],facts:[{content:'A plan was proposed.',fact_key:'meeting.plan',confidence:.7,evidence:[{segment_id:'s1',quote:'A plan was proposed.'}]}],warnings:[]};
 return new Response(`data: ${JSON.stringify({choices:[{index:0,delta:{content:JSON.stringify(value)},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`,{headers:{'Content-Type':'text/event-stream'}});
};
mf=new Miniflare({...convertV4MiniflareOptions({workers:[{name:'upload',modules:true,scriptPath:join(process.cwd(),'dist-worker/index.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,PROJECT_ID:'upload',ADMIN_KEY:owner,MEDIA_ENABLED:'true',MEDIA_BASE_URL:'https://provider.test/v1',MEDIA_MODEL:'qwen3.5-omni-flash',MEDIA_API_KEY:'fixture',MEDIA_OBJECT_BASE_URL:'https://fixture.local'},durableObjects:{PROJECTS:{className:'MemoryProject',useSQLite:true}},r2Buckets:['MEDIA_BUCKET'],serviceBindings:{ASSETS:()=>new Response('')},outboundService:provider,ratelimits:Object.fromEntries(config.ratelimits.map(({name,...v})=>[name,v]))}]}),resourcePersistencePath:folder,unsafeInspectDurableObjects:true});
async function api(method,path,body,key=owner){const r=await mf.dispatchFetch('https://fixture.local'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':body instanceof Uint8Array?'application/octet-stream':'application/json','CF-Connecting-IP':crypto.randomUUID()},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
async function ok(...a){const r=await api(...a);assert.equal(r.status,200,JSON.stringify(r));return r.body;}
async function upload(name,bytes,mime='video/mp4') {let u=await ok('POST','/v1/media/uploads',{user_id:'alice',request_id:name,ref:'meeting',observed_at:'2026-11-10T00:00:00Z',mime_type:mime,size_bytes:bytes.length,consent:true});while(u.received_bytes<bytes.length)u=await ok('PUT',`/v1/media/uploads/${u.id}/parts/${u.next_part}`,bytes.subarray(u.received_bytes,Math.min(bytes.length,u.received_bytes+u.part_size)));return ok('POST',`/v1/media/uploads/${u.id}/complete`);}
async function settle(id){for(let i=0;i<200;i++){const u=await ok('GET','/v1/media/uploads/'+id);if(!['queued','running'].includes(u.state))return u;await new Promise(r=>setTimeout(r,50));}throw Error('job not finished');}
function wav(seconds){const data=Buffer.alloc(seconds*8000), b=Buffer.alloc(44+data.length);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(data.length,40);return b;}
try{
 const clip=await readFile('test/fixtures/media/30min.mp4');
 const j=await upload('video30',clip);const done=await settle(j.id);assert.equal(done.state,'processed',JSON.stringify(done));
 const proposed=await ok('GET','/v1/ingestions/'+done.ingestion_id);assert.equal(proposed.state,'review');assert.equal(proposed.proposal.media.mime_type,'video/mp4');
 console.log('PASS exact 30-minute MP4 reaches review through private range endpoint');
 const before=calls;const over=await upload('over',await readFile('test/fixtures/media/over30min.mp4'));const rejected=await settle(over.id);assert.equal(rejected.error,'media_duration_limit');assert.equal(calls,before);
 console.log('PASS video over 30 minutes fails before provider calls');
 const audio=await upload('audio30',wav(1800),'audio/wav');const a=await settle(audio.id);assert.equal(a.state,'processed',JSON.stringify(a));
 assert.equal((await mf.getR2Bucket('MEDIA_BUCKET').then(b=>b.list())).objects.length,0);
 console.log('PASS 14 MB 30-minute WAV is chunked, understood and raw data removed');
 const reader=(await ok('POST','/v1/keys',{name:'reader',role:'read',user_id:'alice'})).key;
 assert.equal((await api('POST','/v1/media/uploads',{user_id:'alice'},reader)).status,403);
 const u=await ok('POST','/v1/media/uploads',{user_id:'alice',request_id:'cancel',ref:'meeting',observed_at:'2026-11-10T00:00:00Z',mime_type:'video/mp4',size_bytes:clip.length,consent:true});
 await ok('PUT',`/v1/media/uploads/${u.id}/parts/1`,clip);
 await ok('PUT',`/v1/media/uploads/${u.id}/parts/1`,clip);
 const other=Buffer.from(clip);other[50]^=1;
 assert.equal((await api('PUT',`/v1/media/uploads/${u.id}/parts/1`,other)).status,409);
 await ok('DELETE','/v1/media/uploads/'+u.id);
 assert.equal((await ok('POST',`/v1/media/uploads/${u.id}/complete`)).state,'cancelled');
 console.log('PASS repeat parts, conflicting bytes, cancellation, scope and cleanup');
 const client=new SixteenMemory({baseUrl:'https://fixture.local',apiKey:owner,fetch:(url,init)=>mf.dispatchFetch(url,{...init,headers:{...init.headers,'CF-Connecting-IP':crypto.randomUUID()}})});
 const up=await client.uploadMedia({user_id:'alice',request_id:'sdkblob',ref:'test',observed_at:'2026-11-10T00:00:00Z',mime_type:'audio/wav',size_bytes:wav(1800).length,consent:true},new Blob([wav(1800)]));
 assert.equal((await settle(up.id)).state,'processed');
 console.log('PASS JS Blob SDK streams multi-part 30-minute uploads');
 const server=createServer(async(req,res)=>{try{const buffers=[];for await(const b of req)buffers.push(b);const result=await mf.dispatchFetch('https://fixture.local'+req.url,{method:req.method,headers:{...req.headers,'CF-Connecting-IP':crypto.randomUUID()},...(buffers.length?{body:Buffer.concat(buffers)}:{})});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end('{}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const script=`import asyncio,os
from sixteen_memory import SixteenMemory,AsyncSixteenMemory
args=dict(user_id="alice",ref="py",observed_at="2026-11-10T00:00:00Z",mime_type="video/mp4",consent=True)
c=SixteenMemory(os.environ["TEST_BASE"],os.environ["TEST_KEY"])
u=c.upload_media("test/fixtures/media/30min.mp4",request_id="pysync-upload",**args)
assert u["state"] in ["queued","running"]
async def main():
 async with AsyncSixteenMemory(os.environ["TEST_BASE"],os.environ["TEST_KEY"]) as c:
  u=await c.upload_media("test/fixtures/media/30min.mp4",request_id="pyasync-upload",**args)
  assert u["state"] in ["queued","running"]
asyncio.run(main())
`;
 const output=await new Promise(resolve=>{const child=spawn(process.env.PYTHON_BIN||'.local/python-build-env/bin/python',['-c',script],{env:{...process.env,PYTHONPATH:join(process.cwd(),'sdk-python'),TEST_BASE:'http://127.0.0.1:'+server.address().port,TEST_KEY:owner},stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.on('error',e=>resolve({code:1,text:e.message}));child.on('close',code=>resolve({code,text}));});assert.equal(output.code,0,output.text);
 console.log('PASS Python sync/async file helpers upload through loopback HTTP');
 }finally{await new Promise(resolve=>server.close(resolve));}

}finally{await mf.dispose();await rm(folder,{recursive:true,force:true});}
