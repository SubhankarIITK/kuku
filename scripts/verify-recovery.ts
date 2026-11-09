// Explicit MongoDB integration check. Uses only unique synthetic records and no Groq calls.
import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(!process.argv.includes('--mongodb'))throw new Error('Pass --mongodb to run the isolated database check.');
process.env.STORAGE_BACKEND='mongodb';
process.env.HOSTED_MODE='true';
const {makeDataset}=await import('../backend/src/parser.js');
const {read,save}=await import('../backend/src/storage.js');
const {cloud,rpc}=await import('../backend/src/cloud.js');
const {createHostedJob,stepHostedJob,resumeHostedJob}=await import('../backend/src/hosted-jobs.js');
const {defaultWeights}=await import('../backend/src/types.js');
const suffix=randomUUID(),model=`synthetic-recovery-${suffix}`;
const script=(episode:number)=>`EPISODE NUMBER: Episode ${episode}\nSCENE 01\nScene heading: INT. TEST\nScene start: 00:00.00\nScene end: 00:40.00\n`+Array.from({length:8},(_,i)=>`**TEST PERSON:**\nStart: (00:${String(i*5).padStart(2,'0')}.00) | End: (00:${String(i*5+4).padStart(2,'0')}.00)\nWho sent the synthetic secret ${suffix}?\n\n`).join('');
const ds=makeDataset([1,2].map(n=>({name:`episode-${n}.txt`,text:script(n)})),'Synthetic recovery verification');
let calls=0;const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{calls++;throw new Error('Real AI requests are prohibited in this check.');};
const db=await cloud(),jobs:string[]=[];
try{
  await save(`data/datasets/${ds.id}.json`,ds);
  const options={mode:'offline' as const,provider:'groq' as const,limit:1,weights:defaultWeights};
  let job=await createHostedJob(ds,options);jobs.push(job.id);
  job=await stepHostedJob(job.id);assert.equal(job.progress,.5);
  // Simulate a worker dying after result commit, before cursor/pointer publication.
  const interrupted=await read<any>(`data/jobs/${job.id}.json`);interrupted.cursor=0;interrupted.progress=0;
  await save(`data/jobs/${job.id}.json`,interrupted);
  await db.collection('files').deleteOne({_id:`data/latest-${ds.id}.json` as any});
  job=await stepHostedJob(job.id);assert.equal(job.progress,.5);
  assert.equal((await read<any>(`data/latest-${ds.id}.json`)).runId,job.id);
  const stored=await read<any>(`data/jobs/${job.id}.json`);stored.status='failed';stored.error='Synthetic connection interruption';await save(`data/jobs/${job.id}.json`,stored);
  job=await resumeHostedJob(job.id);assert.equal(job.progress,.5);assert.equal(job.id,stored.id);
  await Promise.all([stepHostedJob(job.id),stepHostedJob(job.id)]);
  const finished=await read<any>(`data/jobs/${job.id}.json`);assert.equal(finished.status,'complete');assert.equal(finished.cursor,2);
  const run=await read<any>(`outputs/${job.id}/run.json`);assert.deepEqual(run.manifest.completedEpisodes,[1,2]);
  await save(`data/cooldowns/${model}.json`,{retryAt:new Date(Date.now()+60000).toISOString()});
  job=await createHostedJob(ds,{...options,mode:'ai',model});jobs.push(job.id);
  job=await stepHostedJob(job.id);assert.equal(job.status,'running');assert.ok(job.retryAt);assert.equal(job.progress,0);
  const again=await stepHostedJob(job.id);assert.equal(again.retryAt,job.retryAt);assert.equal(again.progress,0);assert.equal(calls,0);
  const args={p_model:model,p_daily_limit:200,p_tpm:100};
  const first=await rpc<any>('kuku_reserve_tokens',{...args,p_tokens:60});assert.equal(first.waitMs,0);
  await rpc('kuku_settle_tokens',{p_model:model,p_reserved:60,p_actual:20,p_reserved_at:first.reservedAt});
  assert.equal(await rpc('kuku_quota_used',{p_model:model}),20);
  const second=await rpc<any>('kuku_reserve_tokens',{...args,p_tokens:60});assert.equal(second.waitMs,0);
  const quotaId=model+':'+new Date().toISOString().slice(0,10);
  await db.collection('quota').updateOne({_id:quotaId as any},{$set:{windowStart:Date.now()-62000}});
  await rpc('kuku_reserve_tokens',{...args,p_tokens:30});
  await rpc('kuku_settle_tokens',{p_model:model,p_reserved:60,p_actual:10,p_reserved_at:second.reservedAt});
  const quota=await db.collection('quota').findOne({_id:quotaId as any});assert.equal(quota?.used,60);assert.equal(quota?.windowTokens,30);
  console.log('Passed: commit recovery, same-job resume, concurrent-step deduplication, durable cooldown, zero inference, quota reconciliation across minute windows.');
}catch(e){console.error((e as Error).message);process.exitCode=1;}
finally{
  globalThis.fetch=originalFetch;
  // Only remove this check's unique dataset, jobs, model ledger and associated run artifacts.
  const runs=await db.collection('files').find({_id:{$regex:'^outputs/.+/run.json$'} as any,content:{$regex:ds.id}},{projection:{_id:1}}).toArray();
  const ids=runs.map(r=>String(r._id).split('/')[1]);
  const exact=[`data/datasets/${ds.id}.json`,`data/active-${ds.id}.json`,`data/latest-${ds.id}.json`,`data/cooldowns/${model}.json`,...jobs.map(id=>`data/jobs/${id}.json`)];
  await db.collection('files').deleteMany({$or:[{_id:{$in:exact} as any},...ids.map(id=>({_id:{$regex:`^outputs/${id}/`} as any}))]});
  await db.collection('quota').deleteMany({_id:{$regex:'^'+model+':'} as any});
  process.exit(process.exitCode??0);
}
