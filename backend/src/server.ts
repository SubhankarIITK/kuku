import {Binary} from 'mongodb';
import {Readable} from 'node:stream';
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import {z} from 'zod';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {loadZip} from './parser.js';
import {read,save,list,root} from './storage.js';
import {analyze,toCSV} from './pipeline.js';
import {defaultWeights,type Dataset,type Job,type Review,type Run} from './types.js';
import {groqBudget,budgetMessage} from './budget.js';
import {rawOutputArchive} from './raw-export.js';
import {hosted,cloud,acquireLease} from './cloud.js';
import {validSession,sessionConfigured,passwordMatches,setSession} from './session.js';
import {activeHostedJob,createHostedJob,stepHostedJob} from './hosted-jobs.js';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'100kb'}));
const port=Number(process.env.PORT??3001);
app.use('/api',(req,res,next)=>{
  const host=req.hostname;if(!hosted&&!['127.0.0.1','localhost','::1'].includes(host)){res.status(403).json({error:{code:'LOCAL_ONLY',message:'Use localhost or 127.0.0.1'}});return;}
  const allowedOrigins=hosted?[`https://${req.headers.host}`,process.env.APP_ORIGIN].filter(Boolean):['http://127.0.0.1:5173','http://localhost:5173',`http://127.0.0.1:${port}`,`http://localhost:${port}`];
  const origin=req.headers.origin;if(origin&&!allowedOrigins.includes(origin)){res.status(403).json({error:{code:'ORIGIN',message:'Cross-origin access blocked'}});return;}
  if(['POST','PUT','DELETE'].includes(req.method)&&req.headers['x-kuku-client']!=='local'){res.status(403).json({error:{code:'CLIENT',message:'Local client header required'}});return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(hosted&&req.path!=='/session'){
    if(!sessionConfigured()||!process.env.MONGODB_URI){res.status(503).json({error:{code:'SETUP_REQUIRED',message:'Hosted configuration is incomplete. Set MONGODB_URI, APP_PASSWORD (12+ characters), and SESSION_SECRET (32+ characters).'}});return;}
    if(!validSession(req)){res.status(401).json({error:{code:'SIGN_IN',message:'Sign in to access this private workspace'}});return;}
  }
  next();
});
app.get('/api/session',(req,res)=>res.json({hosted,authenticated:validSession(req),setupReady:!hosted||(sessionConfigured()&&!!process.env.MONGODB_URI)}));
app.post('/api/session',async(req,res)=>{
  if(!hosted){res.json({authenticated:true});return;}if(!sessionConfigured()){res.status(503).json({error:{code:'SETUP_REQUIRED',message:'Workspace password is not configured'}});return;}
  if(req.body?.logout===true){res.clearCookie('kuku_session',{path:'/'});res.json({authenticated:false});return;}
  const password=z.string().min(1).max(200).parse(req.body?.password),owner=randomUUID();
  if(!await acquireLease('login:'+createHash('sha256').update(req.ip??'unknown').digest('hex'),owner,2)){res.status(429).json({error:{code:'LOGIN_RATE',message:'Please wait a moment before trying again'}});return;}
  if(!passwordMatches(password)){res.status(401).json({error:{code:'PASSWORD',message:'Incorrect workspace password'}});return;}
  setSession(res);res.json({authenticated:true});
});
const idSchema=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);const episodeSchema=z.coerce.number().int().positive();
async function dataset(id:unknown){return read<Dataset>(`data/datasets/${idSchema.parse(id)}.json`);}
async function current(id:unknown){const dsId=idSchema.parse(id);const {runId}=await read<{runId:string}>(`data/latest-${dsId}.json`);const key=idSchema.parse(runId);return read<Run>(`outputs/${key}/run.json`).catch(async e=>{if((e as NodeJS.ErrnoException).code==='ENOENT')return read<Run>(`outputs/${key}/live.json`);throw e;});}
app.get('/api/health',async(_req,res)=>{
  const preferredModel=process.env.LLM_MODEL??'openai/gpt-oss-120b';
  const preferred=await groqBudget(preferredModel),fallback=await groqBudget('openai/gpt-oss-20b');
  const fallbackActive=!!process.env.GROQ_API_KEY&&preferredModel==='openai/gpt-oss-120b'&&preferred.blocked&&!fallback.blocked;
  res.json({ok:true,private:true,hosted,providers:{gemini:!!process.env.GEMINI_API_KEY,groq:!!process.env.GROQ_API_KEY},groqBudget:preferred,groqBudgets:[preferred,...(fallback.model===preferred.model?[]:[fallback])],preferredModel,fallbackActive,providerCheck:await read('data/provider-check.json').catch(()=>null),defaultProvider:process.env.LLM_PROVIDER??'groq',defaultModel:fallbackActive?fallback.model:preferredModel});
});
app.get('/api/datasets',async(_req,res)=>{const datasets=await Promise.all((await list('data/datasets')).map(f=>read<Dataset>(`data/datasets/${f}`)));res.json(datasets.map(({episodes,...d})=>({...d,episodeCount:episodes.length,episodeNumbers:episodes.map(e=>e.number)})));});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15_000_000,files:1}});
const weightsSchema=z.object({hook:z.number().nonnegative(),cliffhanger:z.number().nonnegative(),standaloneClarity:z.number().nonnegative(),emotionalImpact:z.number().nonnegative(),pacing:z.number().nonnegative()}).refine(w=>Object.values(w).reduce((a,b)=>a+b,0)>0);
const startSchema=z.object({datasetId:idSchema,mode:z.enum(['offline','ai']),provider:z.enum(['gemini','groq']).default('gemini'),model:z.string().regex(/^[\w.\-/]{1,100}$/).optional(),limit:z.number().int().min(1).max(20).default(6),weights:weightsSchema.default(defaultWeights),episodes:z.array(z.number().int().positive()).min(1).max(500).optional()});
const activeJobs=new Map<string,Job>();let activeAIJob:Job|null=null;
async function externalJob():Promise<Job|null>{try{const {id}=await read<{id:string}>('data/external-job.json');const j=await read<Job>(`data/jobs/${idSchema.parse(id)}.json`);return (j.status==='running'||j.status==='queued')&&Date.now()-new Date(j.createdAt).getTime()<4*3600000?j:null;}catch{return null;}}
if(!hosted)for(const f of await list('data/jobs')){const j=await read<Job>(`data/jobs/${f}`);if(j.status==='queued'||j.status==='running'){j.status='interrupted';j.error='Server restarted; rerun analysis';await save(`data/jobs/${f}`,j);}}
async function launchJob(ds:Dataset,options:z.infer<typeof startSchema>):Promise<Job>{
  if(hosted)return createHostedJob(ds,options);
  const existing=activeJobs.get(ds.id);if(existing)return existing;
  if(options.mode==='ai'&&activeAIJob)throw new Error('Another AI analysis is already running. Local analysis is still available.');
  const job:Job={id:randomUUID(),datasetId:ds.id,status:'queued',progress:0,stage:options.mode==='offline'?'Preparing your local shortlist':'Queued for AI analysis',createdAt:new Date().toISOString()};
  activeJobs.set(ds.id,job);if(options.mode==='ai')activeAIJob=job;
  try{await save(`data/jobs/${job.id}.json`,job);}catch(e){activeJobs.delete(ds.id);if(activeAIJob===job)activeAIJob=null;throw e;}
  setImmediate(()=>{void(async()=>{try{job.status='running';await save(`data/jobs/${job.id}.json`,job);const run=await analyze(ds,options,async(p,stage)=>{job.progress=p;job.stage=stage;await save(`data/jobs/${job.id}.json`,job);});job.progress=1;job.runId=run.id;if(run.manifest.published===false){job.status='failed';job.error=String(run.failures.find(f=>f.error)?.error??'AI returned no usable suggestions.')+' Your previous shortlist is preserved. Local analysis uses no API calls.';job.stage='AI unavailable; previous results preserved';}else{job.status='complete';job.stage=run.manifest.status==='partial'?'Finished with limitations; inspect evaluation':'Analysis complete';}}catch(e){job.status='failed';job.error=(e as Error).message;job.stage='Analysis failed';}finally{try{await save(`data/jobs/${job.id}.json`,job);}finally{activeJobs.delete(ds.id);if(activeAIJob===job)activeAIJob=null;}}})().catch(e=>console.error('Job persistence failed:',(e as Error).message));});
  return job;
}
async function importDataset(buffer:Buffer,name:string){
  const ds=loadZip(buffer,name.replace(/\.zip$/i,''));await save(`data/datasets/${ds.id}.json`,ds);
  const existing=hosted?await activeHostedJob(ds.id):(activeJobs.get(ds.id)??await externalJob());
  const sameJob=existing?.datasetId===ds.id?existing:null;
  let ready=false;try{await current(ds.id);ready=true;}catch{}
  const job=sameJob??(ready?null:await launchJob(ds,startSchema.parse({datasetId:ds.id,mode:'offline',limit:6})));
  return {id:ds.id,report:ds.report,job,resultReady:ready,reused:ready&&!sameJob};
}
app.post('/api/datasets/upload',upload.single('file'),async(req,res)=>{
  if(!req.file)throw new Error('Choose a screenplay ZIP');
  if(!/\.zip$/i.test(req.file.originalname))throw new Error('Choose a .zip archive containing timestamped .txt screenplays.');
  res.status(201).json(await importDataset(req.file.buffer,req.file.originalname));
});
app.post('/api/datasets/upload-url',async(req,res)=>{
  if(!hosted){res.status(400).json({error:{code:'LOCAL_UPLOAD',message:'Use the local ZIP upload endpoint'}});return;}
  const {name,size}=z.object({name:z.string().min(1).max(200).regex(/\.zip$/i),size:z.number().int().positive().max(15_000_000)}).parse(req.body),id=randomUUID();
  await save(`data/uploads/${id}.json`,{name,size,createdAt:new Date().toISOString()});res.json({uploadId:id,chunkSize:3_000_000});
});
app.put('/api/datasets/uploads/:id/:part',express.raw({type:'application/octet-stream',limit:'3mb'}),async(req,res)=>{
  const id=idSchema.parse(req.params.id),index=z.coerce.number().int().min(0).max(4).parse(req.params.part),record=await read<{size:number;createdAt:string}>(`data/uploads/${id}.json`);
  if(Date.now()-Date.parse(record.createdAt)>15*60000)throw new Error('Upload expired. Please choose the ZIP again.');
  const expected=Math.min(3_000_000,record.size-index*3_000_000);
  if(!Buffer.isBuffer(req.body)||expected<=0||req.body.length!==expected)throw new Error('ZIP chunk size does not match');
  await (await cloud()).collection('upload_chunks').updateOne({uploadId:id,index},{$set:{data:new Binary(req.body),expiresAt:new Date(Date.now()+3600000)}},{upsert:true});res.json({received:index});
});
app.post('/api/datasets/upload-complete',async(req,res)=>{
  const id=idSchema.parse(req.body?.uploadId),record=await read<{name:string;size:number;createdAt:string}>(`data/uploads/${id}.json`);
  if(Date.now()-Date.parse(record.createdAt)>15*60000)throw new Error('Upload expired. Please choose the ZIP again.');
  const chunks=await (await cloud()).collection<{uploadId:string;index:number;data:Binary}>('upload_chunks').find({uploadId:id}).sort({index:1}).toArray();
  if(chunks.length!==Math.ceil(record.size/3_000_000)||chunks.some((c,i)=>c.index!==i))throw new Error('Some ZIP chunks are missing. Please upload again.');
  const buffer=Buffer.concat(chunks.map(c=>Buffer.from(c.data.value())));if(buffer.length!==record.size)throw new Error('Uploaded ZIP size does not match');
  res.status(201).json(await importDataset(buffer,record.name));
});
app.post('/api/analysis/start',async(req,res)=>{
  const options=startSchema.parse(req.body);const external=hosted?await activeHostedJob(options.datasetId):await externalJob();
  const existing=activeJobs.get(options.datasetId)??(external?.datasetId===options.datasetId?external:null)??(options.mode==='ai'?(activeAIJob??external):null);
  if(existing){res.status(409).json({error:{code:'JOB_ACTIVE',message:existing.datasetId===options.datasetId?'This screenplay is already being analyzed. Its progress is shown in the workspace.':'Another AI analysis is running. You can still upload a ZIP or create a local shortlist without Groq.'},job:existing});return;}
  if(options.mode==='ai'&&!process.env[options.provider==='gemini'?'GEMINI_API_KEY':'GROQ_API_KEY']){res.status(422).json({error:{code:'MISSING_KEY',message:'Configure the provider API key in .env and restart the server'}});return;}
  if(options.mode==='ai'&&options.provider==='groq'){const budget=await groqBudget(options.model);if(budget.blocked){res.status(429).json({error:{code:'LOCAL_DAILY_BUDGET',message:budgetMessage(budget)},budget});return;}}
  const ds=await dataset(options.datasetId);if(options.episodes?.some(n=>!ds.episodes.some(e=>e.number===n)))throw new Error('Selected episode not in dataset');
  res.status(202).json(await launchJob(ds,options));
});
app.get('/api/analysis/active',async(req,res)=>{const id=req.query.datasetId===undefined?undefined:idSchema.parse(req.query.datasetId);if(hosted){res.json(await activeHostedJob(id));return;}const external=await externalJob();res.json(id?(activeJobs.get(id)??(external?.datasetId===id?external:null)):([...activeJobs.values()][0]??external));});
app.post('/api/analysis/:id/step',async(req,res)=>{if(!hosted){res.status(400).json({error:{code:'LOCAL_WORKER',message:'Local jobs run automatically'}});return;}res.json(await stepHostedJob(idSchema.parse(req.params.id)));});
app.get('/api/analysis/:id',async(req,res)=>res.json(await read<Job>(`data/jobs/${idSchema.parse(req.params.id)}.json`)));
app.get('/api/episodes',async(req,res)=>{const ds=await dataset(req.query.datasetId);res.json(ds.episodes.map(e=>({number:e.number,durationMs:e.durationMs,events:e.events.length,scenes:e.scenes.length,warnings:e.warnings.length,logline:e.logline})));});
app.get('/api/episodes/:number',async(req,res)=>{const ds=await dataset(req.query.datasetId);const ep=ds.episodes.find(e=>e.number===episodeSchema.parse(req.params.number));if(!ep){res.status(404).json({error:{code:'NOT_FOUND',message:'Episode not found'}});return;}res.json(ep);});
app.get('/api/promos',async(req,res)=>{try{const run=await current(req.query.datasetId);const reviews=await getReviews(run.id);res.json({runId:run.id,manifest:run.manifest,metrics:run.metrics,promos:run.promos,reviews});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){res.json({promos:[],reviews:[],manifest:null,metrics:null});return;}throw e;}});
app.get('/api/promos/:id',async(req,res)=>{const run=await current(req.query.datasetId);const p=run.promos.find(p=>p.id===idSchema.parse(req.params.id));if(!p){res.status(404).json({error:{code:'NOT_FOUND',message:'Promo not found'}});return;}res.json(p);});
const ratingsSchema=z.object({hook:z.number().int().min(1).max(5),cliffhanger:z.number().int().min(1).max(5),clarity:z.number().int().min(1).max(5),boundaries:z.number().int().min(1).max(5),usefulness:z.number().int().min(1).max(5)});
const reviewSchema=z.object({datasetId:idSchema,runId:idSchema,ratings:ratingsSchema,label:z.enum(['Good promo','Needs boundary adjustment','Lacks context','Weak hook','Weak cliffhanger','Invalid timestamp','Other failure']),notes:z.string().max(5000)});
app.post('/api/promos/:id/review',async(req,res)=>{const b=reviewSchema.parse(req.body),run=await current(b.datasetId),promoId=idSchema.parse(req.params.id);if(run.id!==b.runId){res.status(409).json({error:{code:'STALE_RUN',message:'Results changed; refresh before reviewing'}});return;}if(!run.promos.some(p=>p.id===promoId))throw new Error('Unknown promo');const review:Review={promoId,runId:run.id,ratings:b.ratings,label:b.label,notes:b.notes,updatedAt:new Date().toISOString()};await save(`data/reviews/${run.id}/${promoId}.json`,review);res.json(review);});
async function getReviews(runId:string){return Promise.all((await list(`data/reviews/${runId}`)).map(f=>read<Review>(`data/reviews/${runId}/${f}`)));}
app.get('/api/evaluation',async(req,res)=>{const run=await current(req.query.datasetId);res.json({metrics:run.metrics,manifest:run.manifest,baseline:run.baseline,failures:run.failures,reviews:await getReviews(run.id)});});
app.get('/api/export/raw-output.zip',async(req,res)=>{
  const datasetId=idSchema.parse(req.query.datasetId);
  const run=req.query.runId===undefined?await current(datasetId):await read<Run>(`outputs/${idSchema.parse(req.query.runId)}/run.json`).catch(async e=>{if((e as NodeJS.ErrnoException).code==='ENOENT')return read<Run>(`outputs/${idSchema.parse(req.query.runId)}/live.json`);throw e;});
  if(run.datasetId!==datasetId){res.status(404).json({error:{code:'NOT_FOUND',message:'Run does not belong to this screenplay'}});return;}
  const archive=await rawOutputArchive(run);
  res.attachment(`kuku-raw-output-${run.id}.zip`).type('application/zip');
  if(hosted){Readable.from((function*(){for(let start=0;start<archive.length;start+=65536)yield archive.subarray(start,start+65536);})()).pipe(res);return;}
  res.send(archive);
});
app.get('/api/export/:file',async(req,res)=>{const file=z.enum(['promos.json','promos.csv','evaluation.json','run_manifest.json','reviews.json']).parse(req.params.file);const run=await current(req.query.datasetId);res.attachment(file);if(file==='promos.csv'){res.type('text/csv').send(toCSV(run.promos));return;}res.type('application/json').send(JSON.stringify(file==='promos.json'?run.promos:file==='run_manifest.json'?run.manifest:file==='reviews.json'?await getReviews(run.id):{...run.metrics,reviews:await getReviews(run.id)},null,2));});
app.use(express.static(path.join(root,'dist')));
app.get('/{*path}',(req,res)=>{if(req.path.startsWith('/api/')){res.status(404).json({error:{code:'NOT_FOUND',message:'Endpoint not found'}});return;}res.sendFile(path.join(root,'dist/index.html'));});
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const e=err as NodeJS.ErrnoException;const status=err instanceof z.ZodError?400:e.code==='ENOENT'?404:err instanceof multer.MulterError?400:400;res.status(status).json({error:{code:err instanceof z.ZodError?'VALIDATION':e.code==='ENOENT'?'NOT_FOUND':'REQUEST_FAILED',message:e.code==='ENOENT'?'Requested data not found':err instanceof z.ZodError?'Invalid request: '+err.issues.map(i=>i.path.join('.')+' '+i.message).join('; '):e.message||'Request failed'}});});
if(!hosted)app.listen(port,'127.0.0.1',()=>console.log(`Kuku Promo Intelligence: http://127.0.0.1:${port} (local/private)`));
export default app;
