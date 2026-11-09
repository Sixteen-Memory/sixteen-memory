import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
const config=JSON.parse(await readFile("wrangler.jsonc","utf8"));
const directory=await mkdtemp(join(tmpdir(),"sixteen-round1-"));
const owner="synthetic-round1-owner-01234567890123456789";
let calls=0, broken=false, slot="user.current_residence_city", city="成都";
const groups=[];
const run=async(name,fn)=>{await fn();groups.push(name);console.log("PASS",name);};
const fakeOutbound=async request=>{
  const body=await request.json();calls++;
  if(request.url.endsWith("/embeddings")){
    if(broken)return new Response("fixture outage",{status:503});
    assert.equal(body.dimensions,4);
    return Response.json({data:body.input.map((_,index)=>({index,embedding:[1,0,0,0]})),usage:{prompt_tokens:1}});
  }
  assert.ok(request.url.endsWith("/chat/completions"));
  const p=JSON.parse(body.messages[1].content);
  const result=p.messages?{facts:[{content:`用户住在${city}`,fact_key:slot,confidence:.99,evidence:[{message_id:"m1",quote:p.messages[0].content}]}]}:
    {decisions:p.facts.map((fact,fact_index)=>{
      const old=p.existing.find(m=>m.fact_key===fact.fact_key);
      return {fact_index,action:old?(old.content===fact.content?"merge":"supersede"):"add",target_id:old?.id??null,supported:true,confidence:.99,reason:"受控协议响应，不代表模型能力"};
    })};
  return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(result)}}]});
};
function create(){
  const workers=["plain","smart"].map(name=>({
    name,modules:true,scriptPath:join(process.cwd(),"dist-worker/index.js"),
    compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
    bindings:{...config.vars,PROJECT_ID:name,ADMIN_KEY:owner,...(name==="smart"?{
      EXTRACTION_ENABLED:"true",EXTRACTION_BASE_URL:"https://fixture.test/v1",EXTRACTION_MODEL:"fixture",EXTRACTION_API_KEY:"synthetic",
      EMBEDDINGS_ENABLED:"true",EMBEDDING_PROVIDER:"openai-compatible",EMBEDDING_API_STYLE:"openai-compatible",
      EMBEDDING_DIMENSIONS:"4",EMBEDDING_BASE_URL:"https://fixture.test/v1",EMBEDDING_MODEL:"fixture",EMBEDDING_API_KEY:"synthetic",
    }:{})},durableObjects:{PROJECTS:{className:"MemoryProject",useSQLite:true}},
    serviceBindings:{ASSETS:()=>new Response("")},outboundService:fakeOutbound,
    ratelimits:Object.fromEntries(config.ratelimits.map(({name,...v})=>[name,v])),
  }));
  return new Miniflare({...convertV4MiniflareOptions({workers}),resourcePersistencePath:directory,unsafeInspectDurableObjects:true});
}
let mf=create();
async function api(method,path,body,target="plain",key=owner){
  const worker=await mf.getWorker(target);
  const response=await worker.fetch("https://fixture.local"+path,{method,headers:{
    Authorization:"Bearer "+key,"Content-Type":"application/json","CF-Connecting-IP":crypto.randomUUID(),
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
const draft=(id,user="filters",extra={})=>({user_id:user,request_id:id,content:"合同状态资料",
  source:{type:"manual",ref:"synthetic-record",text:"合同状态资料",observed_at:"2026-11-04T09:00:00Z"},expires_at:null,...extra});
const f=(field,op,value)=>({field,op,value});
const search=(filter,extra={},target="plain",key=owner)=>api("POST","/v1/search",{user_id:"filters",query:"合同",filter,...extra},target,key);
let numeric,boolean,missing,nil;
try{
  await run("metadata types and null/missing semantics survive actual SQLite filtering",async()=>{
    numeric=(await api("POST","/v1/memories",draft("n","filters",{metadata:{priority:1,tag:"a"},category:"support"}))).body;
    boolean=(await api("POST","/v1/memories",draft("b","filters",{metadata:{priority:true,tag:"b"},category:"sales"}))).body;
    missing=(await api("POST","/v1/memories",draft("m"))).body;
    nil=(await api("POST","/v1/memories",draft("nil","filters",{metadata:{priority:null},category:"support"}))).body;
    assert.ok(numeric.id);
    assert.deepEqual((await search(f("metadata.priority","eq",1))).body.data.map(x=>x.id),[numeric.id]);
    assert.deepEqual((await search(f("metadata.priority","eq",true))).body.data.map(x=>x.id),[boolean.id]);
    assert.deepEqual((await search(f("metadata.priority","eq",null))).body.data.map(x=>x.id),[nil.id]);
    assert.deepEqual((await search(f("metadata.priority","exists",false))).body.data.map(x=>x.id),[missing.id]);
    assert.deepEqual(new Set((await search(f("metadata.priority","ne",1))).body.data.map(x=>x.id)),new Set([boolean.id,nil.id]));
    const nested={AND:[{OR:[f("metadata.priority","eq",1),f("metadata.tag","in",["a","b"])]},{NOT:f("category","eq","sales")}]};
    assert.deepEqual((await search(nested)).body.data.map(x=>x.id),[numeric.id]);
    assert.deepEqual((await search(f("metadata.priority","gte",1))).body.data.map(x=>x.id),[numeric.id]);
  });
  await run("filters apply before limit and cannot widen the authorization scope",async()=>{
    await api("POST","/v1/memories",draft("foreign","foreign",{metadata:{priority:1}}));
    const k=(await api("POST","/v1/keys",{name:"read-filter",role:"read",user_id:"filters"})).body.key;
    assert.equal((await search(f("metadata.priority","eq",1),{limit:1},"plain",k)).body.data[0].id,numeric.id);
    assert.equal((await search(f("user_id","eq","foreign"),{},"plain",k)).status,422);
    assert.equal((await search(f("category","eq","support"),{user_id:"foreign"},"plain",k)).status,404);
    assert.equal((await search(f("category","eq","x' OR 1=1--"))).body.data.length,0);
    const bad=await search({OR:[]});assert.equal(bad.status,422);
    assert.equal((await api("GET","/v1/memories?filter=not-json")).status,422);
  });
  await run("validity windows are half-open and distinct from event time and physical expiry",async()=>{
    const scheduled=(await api("POST","/v1/memories",draft("window","time",{event_time:"2026-10-01T08:00:00+08:00",valid_from:"2090-01-01T00:00:00Z",valid_to:"2090-02-01T00:00:00Z"}))).body;
    const at=at=>api("POST","/v1/search",{user_id:"time",query:"合同",...(at?{at}:{})});
    assert.equal((await at()).body.data.length,0);
    assert.equal((await at("2090-01-01T00:00:00Z")).body.data[0].id,scheduled.id);
    assert.equal((await at("2090-02-01T00:00:00Z")).body.data.length,0);
    assert.equal((await api("GET",`/v1/memories/${scheduled.id}`)).body.event_time,"2026-10-01T00:00:00.000Z");
    assert.equal((await api("POST","/v1/memories",draft("invalid-window","time",{valid_from:"2026-11-05T00:00:00",valid_to:null}))).status,422);
    const range=await api("POST","/v1/search",{user_id:"time",query:"合同",at:"2090-01-05T00:00:00Z",filter:f("event_time","gte","2026-10-01T00:00:00Z")});
    assert.equal(range.body.data.length,1);
  });
  await run("updates preserve omitted attributes; history/export retain explicit changes; deletion clears them",async()=>{
    const update=await api("PATCH",`/v1/memories/${numeric.id}`,{content:"合同确认资料",source:numeric.source,expires_at:null,expected_version:1,reason:"保留元数据"});
    assert.equal(update.status,200);assert.deepEqual(update.body.metadata,numeric.metadata);
    const change=await api("PATCH",`/v1/memories/${numeric.id}`,{content:"合同确认资料",source:numeric.source,expected_version:2,reason:"清空元数据",metadata:{},category:null});
    assert.equal(change.status,200);assert.deepEqual(change.body.metadata,{});
    const history=(await api("GET",`/v1/memories/${numeric.id}/history`)).body;
    assert.equal(history.length,3);assert.deepEqual(history[2].metadata,numeric.metadata);
    const exported=await api("GET","/v1/export?user_id=filters&filter="+encodeURIComponent(JSON.stringify(f("category","eq","support"))));
    assert.deepEqual(exported.body.data.map(x=>x.id),[nil.id]);
    await api("DELETE",`/v1/memories/${numeric.id}`,{expected_version:3});
    const sql=await mf.unsafeGetDurableObjectStorage("plain","MemoryProject",{name:"plain"});
    assert.equal((await sql.exec("SELECT count(*) n FROM history WHERE memory_id=?",numeric.id))[0].n,0);
    assert.equal((await api("POST","/v1/memories",draft("secret-metadata","filters",{metadata:{key:"sk-"+"a".repeat(40)}}))).status,422);
  });
  await run("semantic/hybrid/fallback enforce the same filter and time window before returning results",async()=>{
    await api("POST","/v1/memories",draft("s1","filters",{metadata:{priority:2},category:"support"}),"smart");
    await api("POST","/v1/memories",draft("s2","filters",{metadata:{priority:9},category:"sales"}),"smart");
    for(const mode of ["lexical","semantic","hybrid"]){
      const r=await search(f("category","eq","support"),{mode,limit:1},"smart");
      assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.data.length,1);assert.equal(r.body.data[0].category,"support");
    }
    const context=await api("POST","/v1/context",{user_id:"filters",query:"合同",mode:"hybrid",threshold:1,filter:f("category","eq","support")},"smart");
    assert.equal(context.status,200);assert.equal(context.body.memories.length,1);
    assert.equal(context.body.memories[0].sources[0].text,"合同状态资料");
    const before=calls;
    assert.equal((await search(f("category","eq","none"),{mode:"semantic"},"smart")).body.data.length,0);
    assert.equal(calls,before,"empty filtered set does not invoke embeddings");
    assert.equal((await search(f("category","eq","support"),{mode:"hybrid",threshold:1},"smart")).body.data.length,1);
    assert.equal((await search(null,{threshold:0.1},"smart")).status,422);
    assert.equal((await search(null,{mode:"hybrid",threshold:0.1,fallback:"lexical"},"smart")).status,422);
    broken=true;
    const fallback=await search(f("category","eq","support"),{mode:"hybrid",fallback:"lexical"},"smart");
    assert.equal(fallback.body.degraded,true);assert.equal(fallback.body.data.length,1);assert.equal(fallback.body.data[0].category,"support");
    broken=false;
    const denied=(await api("POST","/v1/keys",{name:"foreign-reader",role:"read",user_id:"elsewhere"},"smart")).body.key;
    const count=calls;assert.equal((await search(null,{mode:"semantic"},"smart",denied)).status,404);assert.equal(calls,count);
    await api("POST","/v1/memories",draft("scheduled-smart","filters",{category:"scheduled",valid_from:"2090-01-01T00:00:00Z",valid_to:"2090-02-01T00:00:00Z"}),"smart");
    for(const mode of ["semantic","hybrid"]){
      const filtered=f("category","eq","scheduled");
      assert.equal((await search(filtered,{mode},"smart")).body.data.length,0);
      assert.equal((await search(filtered,{mode,at:"2090-01-01T00:00:00Z"},"smart")).body.data.length,1);
      assert.equal((await search(filtered,{mode,at:"2090-02-01T00:00:00Z"},"smart")).body.data.length,0);
    }
  });
  const ingest=(id,user,observed_at,extra={})=>api("POST","/v1/ingestions",{user_id:user,request_id:id,ref:id,mode:"auto",observed_at,messages:[{id:"m1",role:"user",content:`我现在常住${city}`}],...extra},"smart");
  await run("canonical slot lookup finds legacy aliases when retrieval indexes are unavailable",async()=>{
    slot="user.current_residence_city";city="成都";
    const first=await ingest("first","slots","2026-11-01T09:00:00Z",{metadata:{tier:"gold"},category:"profile"});
    assert.equal(first.body.state,"applied");const id=first.body.results[0].memory_id;
    const sql=await mf.unsafeGetDurableObjectStorage("smart","MemoryProject",{name:"smart"});
    await sql.exec("UPDATE memories SET fact_key='user.residence_city' WHERE id=?",id);
    // Force zero candidate hits from either retrieval index. Slot lookup must stand alone.
    await sql.exec("DELETE FROM search_index WHERE id=?",id);
    await sql.exec("DELETE FROM vectors WHERE memory_id=?",id);
    slot="user.home_city";city="厦门";
    const next=await ingest("next","slots","2026-11-02T09:00:00Z");
    assert.equal(next.body.state,"applied",JSON.stringify(next));
    assert.equal(next.body.results[0].memory_id,id);
    const current=(await api("GET",`/v1/memories/${id}`,undefined,"smart")).body;
    assert.equal(current.version,2);assert.equal(current.fact_key,"user.home_city");assert.deepEqual(current.metadata,{tier:"gold"});
    const before=calls;assert.equal((await ingest("next","slots","2026-11-02T09:00:00Z")).body.state,"applied");assert.equal(calls,before);
    assert.equal((await api("GET",`/v1/memories/${id}/history`,undefined,"smart")).body[1].content,"用户住在成都");
  });
  await run("ambiguous current location, unknown attributes and manual corrections stay reviewable",async()=>{
    slot="user.current_city";city="青岛";
    const result=await ingest("ambiguous","unknown","2026-11-03T09:00:00Z");
    assert.equal(result.body.state,"review");assert.ok(result.body.proposal.decisions[0].review_reasons.includes("unregistered_slot"));
    assert.equal((await api("GET","/v1/memories?user_id=unknown",undefined,"smart")).body.data.length,0);
    const rows=(await api("GET","/v1/memories?user_id=slots",undefined,"smart")).body.data;
    const old=rows[0];
    await api("PATCH",`/v1/memories/${old.id}`,{...old,expected_version:old.version,reason:"人工确认"},"smart");
    slot="user.home_city";
    const protectedResult=await ingest("manual-protect","slots","2026-11-04T09:00:00Z");
    assert.equal(protectedResult.body.state,"review");assert.ok(protectedResult.body.proposal.decisions[0].review_reasons.includes("unsafe_supersession"));
  });
  await run("merge attribute conflicts fail atomically; narrow filters cannot conceal index gaps",async()=>{
    slot="user.home_city";city="杭州";
    const first=await ingest("merge-attrs1","merge-attrs","2026-11-01T09:00:00Z",{metadata:{tag:"keep"},category:"profile"});
    assert.equal(first.body.state,"applied");
    const id=first.body.results[0].memory_id;
    const merged=await ingest("merge-attrs2","merge-attrs","2026-11-02T09:00:00Z",{metadata:{tag:"overwrite"}});
    assert.equal(merged.status,409);assert.equal(merged.body.error.code,"merge_attributes_conflict");
    assert.deepEqual((await api("GET",`/v1/memories/${id}`,undefined,"smart")).body.metadata,{tag:"keep"});
    assert.equal((await api("GET",`/v1/memories/${id}/evidence`,undefined,"smart")).body.supporting.length,0);
    const sql=await mf.unsafeGetDurableObjectStorage("smart","MemoryProject",{name:"smart"});
    await sql.exec("DELETE FROM vectors WHERE memory_id=?",id);
    const before=calls;
    const result=await api("POST","/v1/search",{user_id:"merge-attrs",query:"城市",mode:"semantic",filter:f("category","eq","none")},"smart");
    assert.equal(result.status,409);assert.equal(result.body.error.code,"index_incomplete");assert.equal(calls,before);
    assert.equal((await api("POST","/v1/reindex",{user_id:"merge-attrs"},"smart")).body.indexed,1);
  });
  await run("attribute schema migration is idempotent across a real runtime restart",async()=>{
    await mf.dispose();mf=create();
    const row=await api("GET",`/v1/memories/${boolean.id}`);
    assert.equal(row.status,200);assert.deepEqual(row.body.metadata,{priority:true,tag:"b"});
    assert.equal((await search(f("metadata.priority","eq",true))).body.data[0].id,boolean.id);
  });
  await run("merged supporting quotes are searchable only at the current memory version",async()=>{
    slot="user.home_city";city="苏州";
    const first=await ingest("source-merge1","source-merge","2026-11-01T09:00:00Z");
    assert.equal(first.body.state,"applied");
    const id=first.body.results[0].memory_id;
    const second=await api("POST","/v1/ingestions",{user_id:"source-merge",request_id:"source-merge2",ref:"supplemental",
      mode:"auto",observed_at:"2026-11-02T09:00:00Z",messages:[{id:"m1",role:"user",content:"我常住苏州，SupplementToken"}]},"smart");
    assert.equal(second.body.state,"applied");assert.equal(second.body.results[0].action,"merge");
    const search=()=>api("POST","/v1/evidence/search",{user_id:"source-merge",query:"SupplementToken"},"smart");
    const hit=await search();assert.equal(hit.body.data.length,1);assert.equal(hit.body.data[0].kind,"supporting");assert.equal(hit.body.data[0].memory_id,id);
    const current=(await api("GET",`/v1/memories/${id}`,undefined,"smart")).body;
    const update=await api("PATCH",`/v1/memories/${id}`,{...current,content:"人工确认新地址",expected_version:1,reason:"来源已变化"},"smart");
    assert.equal(update.status,200);assert.equal((await search()).body.data.length,0);
    assert.equal((await api("GET",`/v1/memories/${id}/evidence`,undefined,"smart")).body.supporting.length,1,"historical evidence is retained but not searched as current");
  });
  console.log(JSON.stringify({status:"passed",groups:groups.length,tests:groups,real_model_calls:0,fake_provider_calls:calls,quality_acceptance:"not_run"},null,2));
}finally{await mf.dispose();await rm(directory,{recursive:true,force:true});}
