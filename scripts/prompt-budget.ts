import {read} from '../backend/src/storage.js';
import type {Dataset} from '../backend/src/types.js';
import {baselinePrompt,baselineSchema,batchPrompt,batchSchema} from '../backend/src/llm.js';
import {enumerate,shortlist,neighbors} from '../backend/src/engine.js';
import {z} from 'zod';
const ds=await read<Dataset>('data/datasets/19f452452d3741dc.json');
const est=(p:string,s:unknown)=>Math.ceil((p.length+JSON.stringify(s).length+500)/3.5)+2000;
const rows=ds.episodes.map(ep=>{const all=enumerate(ep),c=shortlist(all,ep,1)[0],alts=shortlist(neighbors(c,all),ep,1);return {ep:ep.number,batch:est(batchPrompt([c,...alts],ep),z.toJSONSchema(batchSchema)),baseline:est(baselinePrompt(ep),z.toJSONSchema(baselineSchema))};});
console.log(JSON.stringify({maxBatch:Math.max(...rows.map(r=>r.batch)),baselineSample:rows.filter(r=>[1,13,26,38,50].includes(r.ep)),reservedTotal:rows.reduce((n,r)=>n+r.batch,0)},null,2));
