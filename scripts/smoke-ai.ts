import 'dotenv/config';
import {read} from '../backend/src/storage.js';
import {analyze} from '../backend/src/pipeline.js';
import {defaultWeights,type Dataset} from '../backend/src/types.js';
const ds=await read<Dataset>('data/datasets/19f452452d3741dc.json');
const run=await analyze(ds,{mode:'ai',provider:'groq',model:'openai/gpt-oss-120b',limit:1,weights:defaultWeights,episodes:[1],baselineSampleSize:1},async(p,s)=>console.log(`${Math.round(p*100)}% ${s}`));
console.log(JSON.stringify({id:run.id,status:run.manifest.status,metrics:{...run.metrics,parsing:undefined},failures:run.failures},null,2));
