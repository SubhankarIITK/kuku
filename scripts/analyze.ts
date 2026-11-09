import 'dotenv/config';
import {list,read} from '../backend/src/storage.js';
import {analyze} from '../backend/src/pipeline.js';
import {defaultWeights,type Dataset} from '../backend/src/types.js';
const files=await list('data/datasets');const datasetId=process.argv.find(x=>x.startsWith('--dataset='))?.split('=')[1];const file=datasetId?`${datasetId}.json`:files[0];if(!file)throw new Error('Import a ZIP first: npm run import -- "path.zip"');
const ds=await read<Dataset>(`data/datasets/${file}`);const run=await analyze(ds,{mode:process.argv.includes('--ai')?'ai':'offline',provider:process.env.LLM_PROVIDER==='groq'?'groq':'gemini',limit:Number(process.env.CANDIDATES_PER_EPISODE??6),weights:defaultWeights},async(p,s)=>{console.log(`${Math.round(p*100)}% ${s}`);});console.log(JSON.stringify({id:run.id,manifest:run.manifest,metrics:{...run.metrics,parsing:undefined}},null,2));
