import {read} from './storage.js';
import {remoteStorage,rpc} from './cloud.js';
export async function groqBudget(model=process.env.LLM_MODEL??'openai/gpt-oss-120b') {
  const now=new Date(),day=now.toISOString().slice(0,10);
  const ledger=remoteStorage()?{tokens:await rpc<number>('kuku_quota_used',{p_model:model})}:await read<{tokens:number}>(`data/quota/${day}-${model.replaceAll('/','_')}.json`).catch(()=>({tokens:0}));
  const limit=Number(process.env.LLM_DAILY_TOKEN_BUDGET??180000),remaining=Math.max(0,limit-ledger.tokens);
  const minimumRequestBudget=Number(process.env.LLM_MAX_COMPLETION_TOKENS??2200)+500;
  return {model,used:ledger.tokens,limit,remaining,blocked:remaining<minimumRequestBudget,resetsAt:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString()};
}
export function budgetMessage(b:Awaited<ReturnType<typeof groqBudget>>){return `The app's local daily token budget has ${b.remaining.toLocaleString('en-US')} tokens remaining (${b.used.toLocaleString('en-US')} / ${b.limit.toLocaleString('en-US')} tracked). New AI requests are paused; saved results and local analysis remain available. This is a local safety budget, not a verified Groq account balance.`;}
