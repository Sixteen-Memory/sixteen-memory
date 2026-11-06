// Fixed adapter fixtures only. Never use as an extraction algorithm or quality judge.
export const smokeDataset = {schema:1,name:"simulated-pipeline-smoke",cases:[{
  id:"smoke",batches:[[{role:"user",content:"I live in Berlin."}]],
  queries:[{query:"Where do I live?",required:["Berlin"],forbidden:[]}],
}]};
export async function fixtureFetch(input, init) {
  const req = new Request(input,init);
  if (new URL(req.url).hostname !== "fixture.test") throw Error("Fixture denied non-test destination");
  const body = await req.json();
  if (req.url.endsWith("/embeddings")) {
    const items = Array.isArray(body.input)?body.input:[body.input];
    return Response.json({data:items.map((_,index)=>({index,embedding:[1,0,0.1,0.2]})),usage:{prompt_tokens:1,total_tokens:1}});
  }
  const system=body.messages[0].content;
  let content;
  if (system.includes("You extract durable")) {
    content=JSON.stringify({facts:[{content:"User lives in Berlin.",fact_key:"user.home_city",confidence:0.99,evidence:[{message_id:"m1",quote:"I live in Berlin."}]}]});
  } else if (system.includes("Compare candidate")) {
    content=JSON.stringify({decisions:[{fact_index:0,action:"add",target_id:null,supported:true,confidence:0.99,reason:"fixture add"}]});
  } else if (system.includes("Memory Extractor")) {
    content=JSON.stringify({memory:[{id:"0",text:"User lives in Berlin."}]});
  } else {
    content="User lives in Berlin. [fixture]";
  }
  return Response.json({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,finish_reason:"stop",message:{role:"assistant",content}}],usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4}});
}
