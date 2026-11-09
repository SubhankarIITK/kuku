import {read,save} from '../backend/src/storage.js';
import {validate,overlap} from '../backend/src/engine.js';
import {hash} from '../backend/src/parser.js';
import type {Dataset,Promo,Run} from '../backend/src/types.js';
const id=process.argv[2];if(!id||!/^[\w-]+$/.test(id))throw new Error('Supply run ID');
const run=await read<Run>(`outputs/${id}/run.json`),ds=await read<Dataset>(`data/datasets/${run.datasetId}.json`);
const rawBaseline=await read<Promo[]>(`outputs/${id}/raw/baseline-suggestions.json`);
const rows=(run.metrics.baselineSampleEpisodes as number[]).map(episode=>{const a=run.promos.filter(p=>p.segments[0].episode===episode),b=rawBaseline.filter(p=>p.segments[0].episode===episode);return {episode,advanced:a.map(p=>({id:p.id,segments:p.segments,score:p.score,validation:validate(p,ds.episodes,p.evaluation)})),baseline:b.map(p=>({id:p.id,segments:p.segments,score:p.score,validation:validate(p,ds.episodes,p.evaluation)})),intersectionOverUnion:a.length&&b.length?overlap(a[0],b[0]):null,humanPreference:null};});
await save(`outputs/${id}/comparison.json`,{note:'Same-model, same-episode comparison. Scores are model judgments, not independent quality labels. Advanced includes deterministic validation and bounded repair; compare call budgets before claiming efficiency.',episodes:rows});
// A reproducibly shuffled evidence pack lets editors compare methods without visible method labels.
const blind=[...run.promos.filter(p=>(run.metrics.baselineSampleEpisodes as number[]).includes(p.segments[0].episode)).map(p=>({method:'advanced',p})),...rawBaseline.map(p=>({method:'baseline',p}))].map(({method,p})=>({code:hash(`${id}:${method}:${p.id}`).slice(0,10),method,p})).sort((a,b)=>a.code.localeCompare(b.code));
await save(`outputs/${id}/blind_review.json`,blind.map(({code,p})=>({code,segments:p.segments,durationMs:p.durationMs,evidence:ds.episodes.flatMap(ep=>ep.events).filter(e=>p.eventIds.includes(e.id)),ratings:{hook:null,cliffhanger:null,clarity:null,boundaries:null,usefulness:null},notes:''})));
await save(`outputs/${id}/blind_review_key.json`,blind.map(({code,method,p})=>({code,method,promoId:p.id})));
const invalid=run.promos.flatMap(p=>validate(p,ds.episodes,p.evaluation).map(error=>({promoId:p.id,error})));
if(invalid.length)throw new Error(`Final result has ${invalid.length} validation errors`);
console.log(JSON.stringify({runId:id,promosVerified:run.promos.length,sampleComparisons:rows.length,blindReviewItems:blind.length,rawBaselineInvalid:rows.flatMap(r=>r.baseline).filter(p=>p.validation.length).length}));
