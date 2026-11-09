import {MongoClient,GridFSBucket,ObjectId,type Db} from 'mongodb';
export const hosted=process.env.VERCEL==='1'||process.env.HOSTED_MODE==='true';
export const remoteStorage=()=>process.env.STORAGE_BACKEND==='mongodb'||hosted;
let connection:Promise<Db>|undefined;
export async function cloud():Promise<Db>{
  if(!process.env.MONGODB_URI)throw new Error('Hosted storage is not configured. Set MONGODB_URI.');
  return connection??=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:5,minPoolSize:0,maxIdleTimeMS:60000,serverSelectionTimeoutMS:10000}).connect().then(async client=>{
    const db=client.db(process.env.MONGODB_DB??'kuku_promo');
    await Promise.all([db.collection('leases').createIndex({expiresAt:1},{expireAfterSeconds:0}),db.collection('upload_chunks').createIndex({uploadId:1,index:1},{unique:true}),db.collection('upload_chunks').createIndex({expiresAt:1},{expireAfterSeconds:0})]);return db;
  }).catch(e=>{connection=undefined;throw e;});
}
export async function acquireLease(key:string,owner:string,seconds=330):Promise<boolean>{
  const db=await cloud();try{const result=await db.collection<{_id:string;owner:string;expiresAt:Date}>('leases').findOneAndUpdate({_id:key,expiresAt:{$lte:new Date()}},{$set:{owner,expiresAt:new Date(Date.now()+seconds*1000)}},{upsert:true,returnDocument:'after'});return result?.owner===owner;}catch(e){if((e as {code?:number}).code===11000)return false;throw e;}
}
export async function releaseLease(key:string,owner:string){await (await cloud()).collection<{_id:string;owner:string}>('leases').deleteOne({_id:key,owner});}
interface Quota {_id:string;used:number;windowStart:number;windowTokens:number}
export async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{
  const db=await cloud(),model=String(args.p_model),reservedAt=Date.now(),day=new Date(reservedAt).toISOString().slice(0,10),id=model+':'+day;
  const collection=db.collection<Quota>('quota');
  if(name==='kuku_quota_used')return ((await collection.findOne({_id:id}))?.used??0) as T;
  if(name==='kuku_settle_tokens'){
    const difference=Number(args.p_actual)-Number(args.p_reserved),reservedAt=Number(args.p_reserved_at??Date.now());
    const reservedId=model+':'+new Date(reservedAt).toISOString().slice(0,10);
    await collection.updateOne({_id:reservedId},{$inc:{used:difference}});
    await collection.updateOne({_id:reservedId,windowStart:{$lte:reservedAt,$gt:reservedAt-61000}},{$inc:{windowTokens:difference}});
    return undefined as T;
  }
  if(name!=='kuku_reserve_tokens')throw new Error('Unknown database operation');
  const owner=crypto.randomUUID(),key='quota:'+model;
  if(!await acquireLease(key,owner,10))return {blocked:false,waitMs:1000} as T;
  try{const q=await collection.findOne({_id:id})??{_id:id,used:0,windowStart:reservedAt,windowTokens:0};
    if(Date.now()-q.windowStart>=61000){q.windowStart=reservedAt;q.windowTokens=0;await collection.updateOne({_id:id},{$set:{windowStart:q.windowStart,windowTokens:0}});}
    const tokens=Number(args.p_tokens);
    if(q.used+tokens>Number(args.p_daily_limit))return {blocked:true,waitMs:0} as T;
    if(q.windowTokens+tokens>Number(args.p_tpm))return {blocked:false,waitMs:Math.max(100,61000-(Date.now()-q.windowStart))} as T;
    await collection.updateOne({_id:id},{$inc:{used:tokens,windowTokens:tokens},$setOnInsert:{windowStart:q.windowStart}},{upsert:true});return {blocked:false,waitMs:0,reservedAt} as T;
  }finally{await releaseLease(key,owner);}
}
interface FileRecord {_id:string;content?:string;gridId?:ObjectId;updatedAt:Date}
export async function writeCloudFile(key:string,content:string){
  const db=await cloud();const record:FileRecord={_id:key,updatedAt:new Date()};
  if(Buffer.byteLength(content,'utf8')<=8_000_000)record.content=content;
  else{const bucket=new GridFSBucket(db,{bucketName:'large_files'}),stream=bucket.openUploadStream(key);await new Promise<void>((resolve,reject)=>{stream.on('error',reject).on('finish',()=>resolve());stream.end(Buffer.from(content,'utf8'));});record.gridId=stream.id;}
  await db.collection<FileRecord>('files').replaceOne({_id:key},record,{upsert:true});
}
export async function readCloudFile(key:string):Promise<Buffer>{
  const db=await cloud(),record=await db.collection<FileRecord>('files').findOne({_id:key});if(!record)throw Object.assign(new Error('Record not found'),{code:'ENOENT'});
  if(record.content!==undefined)return Buffer.from(record.content,'utf8');
  const stream=new GridFSBucket(db,{bucketName:'large_files'}).openDownloadStream(record.gridId!),chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);
}
export async function cloudFiles(prefix:string){const escaped=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return (await (await cloud()).collection<FileRecord>('files').find({_id:{$regex:'^'+escaped}},{projection:{_id:1}}).sort({_id:1}).toArray()).map(r=>r._id);}
