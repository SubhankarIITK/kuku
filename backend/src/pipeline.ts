import {randomUUID} from 'node:crypto';
import {enumerate,shortlist,heuristic,weighted,neighbors,validate,rank,boundaryWarnings,makeCandidate} from './engine.js';
import {RemoteProvider,evaluationSchema,baselineSchema,batchSchema,batchPrompt,candidatePrompt,baselinePrompt,asEvaluation,type LLMProvider} from './llm.js';
import {save,writeText} from './storage.js';
import {guardBoundary} from './boundaries.js';
import {defaultWeights,type Candidate,type Dataset,type Evaluation,type Promo,type Run,type Weights} from './types.js';
export interface RunOptions {mode:'offline'|'ai';provider:'gemini'|'groq';model?:string;limit:number;weights:Weights;episodes?:number[];baselineSampleSize?:number;baselineEpisodes?:number[];publish?:boolean}
export async function analyze(ds:Dataset,options:RunOptions,onProgress:(progress:number,stage:string)=>Promise<void>=async()=>{},injected?:LLMProvider):Promise<Run> {
  const started=Date.now(),id=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
  const provider=options.mode==='ai'?(injected??new RemoteProvider(id,options.provider,options.model)):null;
  const episodes=options.episodes?ds.episodes.filter(e=>options.episodes!.includes(e.number)):ds.episodes;
  if(!episodes.length)throw new Error('No episodes selected');
  const candidates:Candidate[]=[],evaluations:Evaluation[]=[],collected:Promo[]=[],baseline:Promo[]=[],failures:Record<string,unknown>[]=[];let enumerated=0,attempted=0,aiEpisodeSuccesses=0,baselineAttempted=0;
  const pkg=(c:Candidate,e:Evaluation,ep:typeof episodes[number]):Promo=>({...c,evaluation:e,score:weighted(e,options.weights),rank:0,validation:validate(c,episodes,e),warnings:boundaryWarnings(c,ep),diversityPenalty:0});
  const concurrency=provider instanceof RemoteProvider&&provider.kind==='groq'?1:Math.min(4,Math.max(1,Number(process.env.LLM_CONCURRENCY??2)));
  const sampleSize=Math.max(1,Math.min(episodes.length,options.baselineSampleSize??Number(process.env.BASELINE_SAMPLE_SIZE??5)));
  const baselineEpisodes=new Set(options.baselineEpisodes??Array.from({length:sampleSize},(_,i)=>episodes[Math.round(i*(episodes.length-1)/Math.max(1,sampleSize-1))].number));
  if(provider instanceof RemoteProvider)provider.onStatus=async s=>onProgress(done/episodes.length,s);
  let cursor=0,done=0;
  async function worker(){while(cursor<episodes.length){const ep=episodes[cursor++];attempted++;
    const all=enumerate(ep);enumerated+=all.length;const selected=shortlist(all,ep,options.limit);let epAI=false;
    await save(`outputs/${id}/raw/episode-${ep.number}-candidates.json`,{enumerated:all.length,shortlist:selected});
    for(const c of selected){
      candidates.push(c);
      try {
        const alternatives=shortlist(neighbors(c,all),ep,provider?1:2);
        const batchResults=new Map<string,Evaluation>();
        if(provider instanceof RemoteProvider){
          const group=[c,...alternatives];
          const value=await provider.generateStructured(batchPrompt(group,ep),batchSchema,{label:`batch-${c.id}`,validate:v=>{const b=batchSchema.parse(v);return b.evaluations.length!==group.length?['Missing candidate evaluations']:b.evaluations.flatMap((e,i)=>validate(group[i],episodes,asEvaluation(e,provider.model)));}});
          for(const e of value.evaluations)batchResults.set(e.candidateId,asEvaluation(e,provider.model));
        }
        const evaluate=async(x:Candidate):Promise<Evaluation>=>{
          if(!provider)return heuristic(x,ep);
          if(batchResults.has(x.id))return batchResults.get(x.id)!;
          const value=await provider.generateStructured(candidatePrompt(x,ep),evaluationSchema,{label:x.id,validate:v=>validate(x,episodes,asEvaluation(evaluationSchema.parse(v),provider.model))});return asEvaluation(value,provider.model);
        };
        const original=await evaluate(c);evaluations.push(original);let best=c,ev=original;
        // Refine a nearby real-boundary alternative; preserve original when it does not improve.
        for(const alt of alternatives){candidates.push({...alt,originalId:c.id});try{const ae=await evaluate(alt);evaluations.push(ae);if(!validate(alt,episodes,ae).length&&weighted(ae,options.weights)>weighted(ev,options.weights)){best=alt;ev=ae;}}catch(e){failures.push({stage:'boundary_evaluation',candidateId:alt.id,error:(e as Error).message});}}
        const p=pkg(best,ev,ep);p.boundaryComparison={original:c,originalScore:weighted(original,options.weights),selectedScore:weighted(ev,options.weights),reason:best.id===c.id?'No evaluated neighboring cut improved the score; retained original.':'Nearby event-boundary alternative scored higher under the same criteria. Script-level cuts need footage review.'};
        collected.push(guardBoundary(p,episodes,evaluations,options.weights));if(provider)epAI=true;
        if(ev.scores.hook<5||ev.scores.cliffhanger<5||ev.scores.standaloneClarity<5||p.validation.length)failures.push({stage:'selection',candidateId:p.id,segments:p.segments,whySelected:ev.reason,whyWeak:ev.weaknesses,scores:ev.scores,validation:p.validation,improvement:'Inspect opening and ending evidence; adjust boundaries or reject. Heuristic weaknesses are risk signals, not human labels.'});
      }catch(e){failures.push({stage:'candidate_evaluation',candidateId:c.id,error:(e as Error).message});}
    }
    if(epAI)aiEpisodeSuccesses++;
    if(provider&&baselineEpisodes.has(ep.number)){baselineAttempted++;try {
      // Independent direct selection. Raw baseline is preserved before any rejection.
      const result=await provider.generateStructured(baselinePrompt(ep),baselineSchema,{label:`baseline-ep${ep.number}`});
      await save(`outputs/${id}/raw/baseline-ep${ep.number}-suggestions.json`,result);
      for(const b of result.promos){const c=makeCandidate(ep,b.startMs,b.endMs);c.generationMethod='direct-llm-baseline';const e=asEvaluation(b.evaluation,provider.model);baseline.push(pkg(c,e,ep));}
    }catch(e){failures.push({stage:'baseline',episode:ep.number,error:(e as Error).message});}}
    done++;await onProgress(done/episodes.length,`Processed ${done}/${episodes.length} episodes`);
  }}
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  const promos=rank(collected,options.weights), rankedBaseline=rank(baseline,options.weights);
  const invalid=collected.filter(p=>p.validation.length).length,invalidBaseline=baseline.filter(p=>p.validation.length).length;
  const comparable=collected.filter(p=>baselineEpisodes.has(p.segments[0].episode));
  const metrics={episodesDiscovered:ds.report.discovered,episodesAttempted:attempted,episodesWithCandidates:episodes.filter(e=>candidates.some(c=>c.segments[0].episode===e.number)).length,events:ds.report.events,enumeratedCandidates:enumerated,evaluatedCandidates:evaluations.length,validPromos:promos.length,advancedSuggestions:collected.length,advancedInvalid:invalid,baselineSampleEpisodes:[...baselineEpisodes],comparableAdvancedSuggestions:comparable.length,comparableAdvancedInvalid:comparable.filter(p=>p.validation.length).length,baselineAttempted,baselineSuggestions:baseline.length,baselineInvalid:invalidBaseline,baselineValid:rankedBaseline.length,aiEpisodeSuccesses,advancedValidityRate:collected.length?(collected.length-invalid)/collected.length:null,baselineValidityRate:baseline.length?(baseline.length-invalidBaseline)/baseline.length:null,aiComparison:provider?'Baseline comparison uses the evenly spaced episode sample in baselineSampleEpisodes; human quality comparison pending. Advanced pipeline repairs/rejects invalid evidence; baseline validity is measured before rejection.':'Not run: no model requested. Offline output is a heuristic shortlist only.',humanReviews:0,qualityImprovement:null,elapsedMs:Date.now()-started,usage:provider instanceof RemoteProvider?provider.usage:null,cost:null,failures:failures.length,parsing:ds.report};
  const manifest={schemaVersion:'1.0',engineVersion:'1.0',id,datasetId:ds.id,inputHashes:episodes.map(e=>({episode:e.number,sha256:e.sourceHash})),mode:options.mode,model:provider?.model??'deterministic-lexical-v1',options,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),status:options.mode==='ai'&&(aiEpisodeSuccesses<episodes.length||new Set(baseline.map(p=>p.segments[0].episode)).size<baselineEpisodes.size)?'partial':'complete',semanticQualityVerified:false,humanEvaluation:'pending',multiSegmentGeneration:false};
  const run:Run={id,datasetId:ds.id,manifest:{...manifest,published:options.publish!==false&&(options.mode!=='ai'||promos.length>0)},promos,baseline:rankedBaseline,candidates,evaluations,metrics,failures};
  await save(`outputs/${id}/raw/advanced-suggestions.json`,collected);await save(`outputs/${id}/raw/baseline-suggestions.json`,baseline);
  await save(`outputs/${id}/parsed.json`,{episodes:ds.episodes,report:ds.report});await save(`outputs/${id}/candidates.json`,candidates);await save(`outputs/${id}/evaluations.json`,evaluations);
  for(const [file,value] of Object.entries({'promos.json':promos,'rankings.json':promos.map(p=>({id:p.id,rank:p.rank,score:p.score,diversityPenalty:p.diversityPenalty})),'evaluation.json':metrics,'run_manifest.json':manifest,'failures.json':failures,'run.json':run}))await save(`outputs/${id}/${file}`,value);
  await writeText(`outputs/${id}/promos.csv`,toCSV(promos));
  if(run.manifest.published)await save(`data/latest-${ds.id}.json`,{runId:id});return run;
}
export function toCSV(promos:Promo[]):string {
  const cell=(v:unknown)=>{const s=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';};
  return ['rank,id,episode,startMs,endMs,durationSeconds,score,scoreSource,hook,cliffhanger,reason,warnings',...promos.map(p=>[p.rank,p.id,p.segments[0].episode,p.segments[0].startMs,p.segments[0].endMs,p.durationMs/1000,p.score,p.evaluation.source,p.evaluation.evidence.hook.description,p.evaluation.evidence.cliffhanger.description,p.evaluation.reason,p.warnings.join('; ')].map(cell).join(','))].join('\r\n');
}
