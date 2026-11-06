import { SixteenMemory } from "../sdk/index.mjs";
if (process.env.SIXTEEN_APPROVED_MODEL_CALLS !== "yes") throw Error("Requires explicit model-call approval; set SIXTEEN_APPROVED_MODEL_CALLS=yes only after checking provider and budget.");
for (const key of ["SIXTEEN_BASE_URL","SIXTEEN_API_KEY","SIXTEEN_USER_ID"]) if (!process.env[key]) throw Error("Missing " + key);
const client = new SixteenMemory({ baseUrl:process.env.SIXTEEN_BASE_URL,apiKey:process.env.SIXTEEN_API_KEY,timeoutMs:115000 });
const job = await client.ingest({
  user_id:process.env.SIXTEEN_USER_ID,request_id:crypto.randomUUID(),ref:"synthetic-intelligent-example",
  observed_at:new Date().toISOString(),mode:"review",
  messages:[{id:"m1",role:"user",content:"后续请用中文与我沟通，先给结论，再给处理步骤。"}],
});
console.log(JSON.stringify(job,null,2));
console.log("Review the proposal in the console. This example does not approve it or delete any data.");
