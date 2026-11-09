import {randomUUID} from 'node:crypto';
import {read,save,storedFiles,readBytes,writeText} from './storage.js';
import {acquireLease,releaseLease} from './cloud.js';
import {analyze,toCSV,type RunOptions} from './pipeline.js';
import {rank} from './engine.js';
import type {Dataset,Job,Run} from './types.js';

interface HostedJob extends Job {options:RunOptions;episodeNumbers:number[];cursor:number;baselineEpisodes:number[]}
export async function activeHostedJob(datasetId?:string):Promise<Job|null>{
  if(!datasetId)return null;
  const pointer=await read<{id:string}>(`data/active-${datasetId}.json`).catch(()=>null);if(!pointer)return null;
  const job=await read<HostedJob>(`data/jobs/${pointer.id}.json`).catch(()=>null);return job&&['queued','running'].includes(job.status)?job:null;
}
export async function createHostedJob(ds:Dataset,options:RunOptions):Promise<Job>{
  if(options.mode==='ai'&&options.limit!==1)throw new Error('Hosted AI analysis uses one candidate per episode to stay within free-tier runtime limits.');
  const owner=randomUUID(),lock=`create:${ds.id}`;if(!await acquireLease(lock,owner,30))throw new Error('A job is being created for this screenplay. Please retry shortly.');
  try{
    const active=await activeHostedJob(ds.id);if(active)return active;
    const episodes=options.episodes??ds.episodes.map(e=>e.number),size=Math.min(5,episodes.length);
    const job:HostedJob={id:randomUUID(),datasetId:ds.id,status:'queued',progress:0,stage:'Ready to process. Keep this tab open; interrupted work resumes when reopened.',createdAt:new Date().toISOString(),options,episodeNumbers:episodes,cursor:0,baselineEpisodes:Array.from({length:size},(_,i)=>episodes[Math.round(i*(episodes.length-1)/Math.max(1,size-1))])};
    await save(`data/jobs/${job.id}.json`,job);await save(`data/active-${ds.id}.json`,{id:job.id});return job;
  }finally{await releaseLease(lock,owner);}
}
function addNumber(a:unknown,b:unknown){return Number(a??0)+Number(b??0);}
async function appendEpisode(job:HostedJob,ds:Dataset,part:Run,episode:number):Promise<Run>{
  const previous=await read<Run>(`outputs/${job.id}/run.json`).catch(()=>null);
  const completed=[...((previous?.manifest.completedEpisodes as number[]|undefined)??[]),episode];
  const promos=rank([...(previous?.promos??[]),...part.promos],job.options.weights),baseline=rank([...(previous?.baseline??[]),...part.baseline],job.options.weights);
  const done=completed.length===job.episodeNumbers.length,prior=previous?.metrics??{},metrics:Record<string,unknown>={...part.metrics};
  for(const key of ['episodesAttempted','episodesWithCandidates','enumeratedCandidates','evaluatedCandidates','advancedSuggestions','advancedInvalid','baselineAttempted','baselineSuggestions','baselineInvalid','aiEpisodeSuccesses','elapsedMs','comparableAdvancedSuggestions','comparableAdvancedInvalid'])metrics[key]=addNumber(prior[key],part.metrics[key]);
  const pu=prior.usage as Record<string,unknown>|null,cu=part.metrics.usage as Record<string,unknown>|null;
  metrics.usage=cu?Object.fromEntries(Object.keys(cu).map(k=>[k,addNumber(pu?.[k],cu[k])])):null;
  metrics.episodesDiscovered=ds.report.discovered;metrics.events=ds.report.events;metrics.parsing=ds.report;metrics.validPromos=promos.length;metrics.baselineSampleEpisodes=job.baselineEpisodes;
  metrics.advancedValidityRate=Number(metrics.advancedSuggestions)?1-Number(metrics.advancedInvalid)/Number(metrics.advancedSuggestions):null;
  metrics.baselineValidityRate=Number(metrics.baselineSuggestions)?1-Number(metrics.baselineInvalid)/Number(metrics.baselineSuggestions):null;
  const failures=[...(previous?.failures??[]),...part.failures];metrics.failures=failures.length;
  const incomplete=!!previous?.manifest.hadIncompleteEpisodes||part.manifest.status==='partial';const missingAI=job.options.mode==='ai'&&(Number(metrics.aiEpisodeSuccesses)<completed.length||incomplete);
  const run:Run={id:job.id,datasetId:ds.id,manifest:{...part.manifest,id:job.id,options:job.options,startedAt:job.createdAt,status:done?(missingAI?'partial':'complete'):'running',completedEpisodes:completed,episodeRunIds:[...((previous?.manifest.episodeRunIds as string[]|undefined)??[]),part.id],inputHashes:ds.episodes.filter(e=>job.episodeNumbers.includes(e.number)).map(e=>({episode:e.number,sha256:e.sourceHash})),hostedResumable:true,hadIncompleteEpisodes:incomplete,published:job.options.mode==='offline'||promos.length>0},promos,baseline,candidates:[...(previous?.candidates??[]),...part.candidates],evaluations:[...(previous?.evaluations??[]),...part.evaluations],metrics,failures};
  // Copy saved files unchanged so the parent raw download contains the entire run.
  const prefix=`outputs/${part.id}/`;for(const file of await storedFiles(prefix)){const name=file.slice(prefix.length);await writeText(`outputs/${job.id}/${name.startsWith('raw/')?`raw/episode-${episode}/${name.slice(4)}`:`episodes/episode-${episode}/${name}`}`,(await readBytes(file)).toString('utf8'));}
  if(!previous)await save(`outputs/${job.id}/parsed.json`,{episodes:ds.episodes,report:ds.report});
  for(const [name,value] of Object.entries({'run_manifest.json':run.manifest,'promos.json':promos,'evaluation.json':metrics,'failures.json':failures,'candidates.json':run.candidates,'evaluations.json':run.evaluations,'rankings.json':promos.map(p=>({id:p.id,rank:p.rank,score:p.score}))}))await save(`outputs/${job.id}/${name}`,value);
  await writeText(`outputs/${job.id}/promos.csv`,toCSV(promos));await save(`outputs/${job.id}/run.json`,run);if(run.manifest.published)await save(`data/latest-${ds.id}.json`,{runId:job.id});return run;
}
export async function stepHostedJob(id:string):Promise<Job>{
  const owner=randomUUID(),lock=`step:${id}`;
  if(!await acquireLease(lock,owner,330))return read<HostedJob>(`data/jobs/${id}.json`);
  let modelLock:string|undefined;
  try{
    const job=await read<HostedJob>(`data/jobs/${id}.json`);if(!['queued','running'].includes(job.status))return job;
    if(!job.options||!job.episodeNumbers)throw new Error('This job was created locally and cannot be resumed in the hosted worker. Start a new analysis.');
    if(job.options.mode==='ai'){modelLock=`model:${job.options.provider}:${job.options.model??'default'}`;if(!await acquireLease(modelLock,owner,330)){modelLock=undefined;return {...job,stage:'Waiting for another AI request to finish'};}}
    const ds=await read<Dataset>(`data/datasets/${job.datasetId}.json`),episode=job.episodeNumbers[job.cursor];
    const existing=await read<Run>(`outputs/${job.id}/run.json`).catch(()=>null);
    if(!(existing?.manifest.completedEpisodes as number[]|undefined)?.includes(episode)){
      job.status='running';job.stage=`Analyzing episode ${episode} (${job.cursor+1}/${job.episodeNumbers.length})`;await save(`data/jobs/${id}.json`,job);
      const part=await analyze(ds,{...job.options,episodes:[episode],baselineEpisodes:job.options.mode==='ai'&&job.baselineEpisodes.includes(episode)?[episode]:[],publish:false},async(_p,stage)=>{job.stage=stage;await save(`data/jobs/${id}.json`,job);});
      if(job.options.mode==='ai'&&!part.promos.length){job.status='failed';job.error=String(part.failures.find(f=>f.error)?.error??'This episode returned no usable AI clip.');job.stage='AI stopped; previous results preserved';await save(`data/jobs/${id}.json`,job);return job;}
      await appendEpisode(job,ds,part,episode);
    }
    job.cursor++;job.progress=job.cursor/job.episodeNumbers.length;job.runId=id;job.status=job.cursor===job.episodeNumbers.length?'complete':'running';job.stage=job.status==='complete'?'Analysis complete; exports are ready':`${job.cursor}/${job.episodeNumbers.length} episodes saved. Keep this tab open to continue.`;
    await save(`data/jobs/${id}.json`,job);return job;
  }catch(e){const job=await read<HostedJob>(`data/jobs/${id}.json`);job.status='failed';job.error=(e as Error).message;job.stage='Analysis stopped; saved results preserved';await save(`data/jobs/${id}.json`,job);return job;}
  finally{if(modelLock)await releaseLease(modelLock,owner);await releaseLease(lock,owner);}
}
