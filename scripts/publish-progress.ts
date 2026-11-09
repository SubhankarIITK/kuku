import {read,save,list} from '../backend/src/storage.js';
import {makeCandidate,weighted,validate,rank,boundaryWarnings,enumerate} from '../backend/src/engine.js';
import {guardBoundary} from '../backend/src/boundaries.js';
import {defaultWeights,type Dataset,type Evaluation,type Promo,type Run,type Job} from '../backend/src/types.js';
import {evaluationSchema,asEvaluation} from '../backend/src/llm.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const id=process.argv[2],datasetId=process.argv[3];if(!id||!datasetId||![id,datasetId].every(x=>/^[\w-]+$/.test(x)))throw new Error('Usage: publish-progress RUN_ID DATASET_ID');
const ds=await read<Dataset>(`data/datasets/${datasetId}.json`),createdAt=new Date().toISOString();
const totalEnumerated=ds.episodes.reduce((n,ep)=>n+enumerate(ep).length,0);
await save('data/external-job.json',{id});
while(true){
  try {
    const completed=await read<Run>(`outputs/${id}/run.json`).catch(()=>null);
    if(completed){
      const execute=promisify(execFile);
      await execute(process.execPath,['--import','tsx','scripts/finalize-run.ts',id]);
      await execute(process.execPath,['--import','tsx','scripts/evaluate-run.ts',id]);
      await save(`data/jobs/${id}.json`,{id,datasetId,status:'complete',progress:1,stage:'Analysis complete · final exports ready',createdAt,runId:id} satisfies Job);break;
    }
    const files=await list(`outputs/${id}/raw`);const evaluations:Evaluation[]=[],suggestions:Promo[]=[],baseline:Promo[]=[];let inputTokens=0,outputTokens=0,calls=0;
    for(const file of files.filter(f=>f.includes('-attempt'))){const response=await read<{status:number;body:string}>(`outputs/${id}/raw/${file}`);if(response.status!==200)continue;const body=JSON.parse(response.body);inputTokens+=body.usage?.prompt_tokens??0;outputTokens+=body.usage?.completion_tokens??0;calls++;if(file.startsWith('batch-')){const value=JSON.parse(body.choices[0].message.content);for(const e of value.evaluations??[]){const parsed=evaluationSchema.safeParse(e);if(parsed.success)evaluations.push(asEvaluation(parsed.data,'openai/gpt-oss-120b'));}}}
    const evaluatedEpisodes=new Set<number>();
    for(const ep of ds.episodes){const source=await read<{shortlist:ReturnType<typeof makeCandidate>[];enumerated:number}>(`outputs/${id}/raw/episode-${ep.number}-candidates.json`).catch(()=>null);if(!source)continue;for(const original of source.shortlist){const oe=evaluations.find(e=>e.candidateId===original.id);if(!oe)continue;let candidate=original,ev=oe;for(const e of evaluations.filter(e=>e.candidateId.startsWith(`ep${ep.number}_`))){const parts=e.candidateId.split('_');const c=makeCandidate(ep,+parts[1],+parts[2]);if(!validate(c,ds.episodes,e).length&&weighted(e)>weighted(ev)){candidate=c;ev=e;}}const p:Promo={...candidate,evaluation:ev,score:weighted(ev),rank:0,validation:validate(candidate,ds.episodes,ev),warnings:boundaryWarnings(candidate,ep),diversityPenalty:0,boundaryComparison:{original,originalScore:weighted(oe),selectedScore:weighted(ev),reason:candidate.id===original.id?'Original retained.':'Higher-scoring real-boundary alternative.'}};suggestions.push(guardBoundary(p,ds.episodes,evaluations,defaultWeights));evaluatedEpisodes.add(ep.number);}}
    for(const file of files.filter(f=>/^baseline-ep\d+-suggestions\.json$/.test(f))){const epNumber=Number(/ep(\d+)/.exec(file)![1]),ep=ds.episodes.find(e=>e.number===epNumber)!;const b=await read<{promos:{startMs:number;endMs:number;evaluation:Evaluation}[]}>(`outputs/${id}/raw/${file}`);for(const x of b.promos){const c=makeCandidate(ep,x.startMs,x.endMs),evaluation={...x.evaluation,source:'llm' as const,model:'openai/gpt-oss-120b'};baseline.push({...c,evaluation,score:weighted(evaluation),rank:0,validation:validate(c,ds.episodes,evaluation),warnings:boundaryWarnings(c,ep),diversityPenalty:0});}}
    const promos=rank(suggestions),progress=evaluatedEpisodes.size/ds.episodes.length;
    const run:Run={id,datasetId,manifest:{schemaVersion:'1.0',mode:'ai',model:'openai/gpt-oss-120b',status:'running',semanticQualityVerified:false,startedAt:createdAt},promos,baseline:rank(baseline),candidates:suggestions,evaluations,failures:suggestions.filter(p=>p.evaluation.scores.standaloneClarity<5).map(p=>({stage:'selection',candidateId:p.id,whySelected:p.evaluation.reason,whyWeak:p.evaluation.weaknesses})),metrics:{episodesDiscovered:ds.report.discovered,episodesAttempted:evaluatedEpisodes.size,events:ds.report.events,enumeratedCandidates:totalEnumerated,evaluatedCandidates:evaluations.length,validPromos:promos.length,advancedSuggestions:suggestions.length,advancedInvalid:suggestions.filter(p=>p.validation.length).length,advancedValidityRate:suggestions.length?1:null,baselineSampleEpisodes:[1,13,26,38,50],baselineSuggestions:baseline.length,baselineInvalid:baseline.filter(p=>p.validation.length).length,baselineValidityRate:baseline.length?(baseline.length-baseline.filter(p=>p.validation.length).length)/baseline.length:null,aiComparison:'Live partial results. Full-pack analysis is running within the Groq free-tier quota; human comparison remains pending.',elapsedMs:Date.now()-new Date(createdAt).getTime(),usage:{calls,inputTokens,outputTokens,retries:files.filter(f=>f.includes('-error')).length},cost:null}};
    await save(`outputs/${id}/live.json`,run);await save(`data/latest-${datasetId}.json`,{runId:id});await save(`data/jobs/${id}.json`,{id,datasetId,status:'running',progress,stage:`AI analysis: ${evaluatedEpisodes.size}/${ds.episodes.length} episodes · free-tier pacing`,runId:id,createdAt} satisfies Job);
    console.log(`${evaluatedEpisodes.size}/${ds.episodes.length} episodes; ${promos.length} live suggestions`);
  }catch(e){console.error((e as Error).message);}
  await new Promise(r=>setTimeout(r,5000));
}
