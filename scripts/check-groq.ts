import 'dotenv/config';
import {z} from 'zod';
import {RemoteProvider} from '../backend/src/llm.js';
import {save} from '../backend/src/storage.js';
const model='openai/gpt-oss-20b',id=`connection-check-${Date.now()}`;
const provider=new RemoteProvider(id,'groq',model);
const result=await provider.generateStructured('Connection test only. No screenplay data. Return {"ok":true}.',z.object({ok:z.boolean()}),{label:'connection',maxCompletionTokens:256,retries:0});
await save('data/provider-check.json',{model,ok:result.ok,checkedAt:new Date().toISOString(),usage:provider.usage});
console.log(JSON.stringify({model,ok:result.ok,usage:provider.usage}));
