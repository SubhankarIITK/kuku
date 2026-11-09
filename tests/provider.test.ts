import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {RemoteProvider,DeferredProviderError,retryTime} from '../backend/src/llm.js';
import {read} from '../backend/src/storage.js';

test('retry times accept seconds and HTTP dates and have a safe floor',()=>{
  const now=Date.UTC(2026,0,1);
  assert.equal(Date.parse(retryTime('3600',now))-now,3601000);
  assert.equal(Date.parse(retryTime(new Date(now+20000).toUTCString(),now))-now,21000);
  assert.equal(Date.parse(retryTime('0',now))-now,6000);
  assert.equal(Date.parse(retryTime('invalid',now))-now,61000);
});

for(const status of [429,503,401])test(`HTTP ${status} stops repeated calls and preserves the provider record`,async()=>{
  const originalFetch=globalThis.fetch;
  const previous={key:process.env.GROQ_API_KEY,tpm:process.env.LLM_TOKENS_PER_MINUTE,budget:process.env.LLM_DAILY_TOKEN_BUDGET};
  process.env.GROQ_API_KEY='synthetic-key';process.env.LLM_TOKENS_PER_MINUTE='1000000';process.env.LLM_DAILY_TOKEN_BUDGET='1000000';
  let calls=0;const run=`synthetic-cooldown-${randomUUID()}`,model=`synthetic-${randomUUID()}`;
  globalThis.fetch=async()=>{calls++;return new Response('{"error":"synthetic"}',{status,headers:{'retry-after':'3600'}});};
  try{
    const provider=new RemoteProvider(run,'groq',model),schema=z.object({value:z.string()});
    await assert.rejects(provider.generateStructured('Synthetic only',schema,{label:'failure',retries:3}),status===401?/Provider HTTP 401/:(e:unknown)=>e instanceof DeferredProviderError&&Date.parse(e.retryAt)>Date.now()+3500000);
    assert.equal(calls,1);assert.equal(provider.usage.retries,0);
    assert.equal((await read<{status:number}>(`outputs/${run}/raw/failure-attempt1.json`)).status,status);
    if(status!==401){await assert.rejects(provider.generateStructured('Synthetic only',schema,{label:'again'}),DeferredProviderError);assert.equal(calls,1);}
  }finally{globalThis.fetch=originalFetch;for(const [key,value]of Object.entries({GROQ_API_KEY:previous.key,LLM_TOKENS_PER_MINUTE:previous.tpm,LLM_DAILY_TOKEN_BUDGET:previous.budget}))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('local budget exhaustion makes zero network calls and is not retried',async()=>{
  const originalFetch=globalThis.fetch,oldKey=process.env.GROQ_API_KEY,oldBudget=process.env.LLM_DAILY_TOKEN_BUDGET;
  process.env.GROQ_API_KEY='synthetic-test-key';process.env.LLM_DAILY_TOKEN_BUDGET='1';let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('Network must not be used');};
  try{const provider=new RemoteProvider(`synthetic-budget-${randomUUID()}`,'groq',`budget-test-${randomUUID()}`);await assert.rejects(provider.generateStructured('SYNTHETIC DATA',z.object({value:z.string()}),{label:'budget'}),/local daily token budget/);assert.equal(calls,0);assert.equal(provider.usage.calls,0);assert.equal(provider.usage.retries,0);assert.equal(provider.usage.failedRequests,0);}
  finally{globalThis.fetch=originalFetch;if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey;if(oldBudget===undefined)delete process.env.LLM_DAILY_TOKEN_BUDGET;else process.env.LLM_DAILY_TOKEN_BUDGET=oldBudget;}
});
test('provider requests strict JSON, records actual usage, retries malformed data, and reuses cache',async()=>{
  const originalFetch=globalThis.fetch;
  const previous={key:process.env.GROQ_API_KEY,tpm:process.env.LLM_TOKENS_PER_MINUTE,budget:process.env.LLM_DAILY_TOKEN_BUDGET,retries:process.env.LLM_RETRIES};
  process.env.GROQ_API_KEY='synthetic-test-key';process.env.LLM_TOKENS_PER_MINUTE='1000000';process.env.LLM_DAILY_TOKEN_BUDGET='1000000';process.env.LLM_RETRIES='1';
  const runId=`synthetic-provider-${randomUUID()}`;let count=0;let lastBody:Record<string,unknown>={};
  globalThis.fetch=async(_input,init)=>{count++;lastBody=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:count===1?'malformed JSON':JSON.stringify({value:'supported'})}}],usage:{prompt_tokens:11,completion_tokens:7,total_tokens:18}}),{status:200,headers:{'Content-Type':'application/json'}});};
  try {
    const provider=new RemoteProvider(runId,'groq',`openai/gpt-oss-120b-test-${randomUUID()}`),schema=z.object({value:z.string()});
    const result=await provider.generateStructured('SYNTHETIC provider contract test.',schema,{label:'test',validate:v=>schema.parse(v).value==='supported'?[]:['Unsupported']});
    assert.equal(result.value,'supported');assert.equal(count,2);assert.equal((lastBody.response_format as {type:string}).type,'json_schema');assert.equal(lastBody.reasoning_effort,'low');assert.equal(provider.usage.structuredFailures,1);assert.equal(provider.usage.retries,1);assert.equal(provider.usage.inputTokens,22);assert.equal(provider.usage.outputTokens,14);
    const cached=await provider.generateStructured('SYNTHETIC provider contract test.',schema,{label:'test'});assert.equal(cached.value,'supported');assert.equal(count,2);assert.equal(provider.usage.cached,1);
    const raw=await read<{body:string}>(`outputs/${runId}/raw/test-attempt1.json`);assert.ok(raw.body.includes('malformed JSON'));
  }finally{globalThis.fetch=originalFetch;for(const [key,value]of Object.entries({GROQ_API_KEY:previous.key,LLM_TOKENS_PER_MINUTE:previous.tpm,LLM_DAILY_TOKEN_BUDGET:previous.budget,LLM_RETRIES:previous.retries}))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
