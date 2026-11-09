import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {Request,Response} from 'express';
import {hosted} from './cloud.js';
const digest=(value:string)=>createHash('sha256').update(value).digest();
export function passwordMatches(input:string){return !!process.env.APP_PASSWORD&&timingSafeEqual(digest(input),digest(process.env.APP_PASSWORD));}
function signature(value:string){return createHmac('sha256',process.env.SESSION_SECRET??'').update(value).digest('hex');}
export function sessionConfigured(){return (process.env.APP_PASSWORD?.length??0)>=12&&(process.env.SESSION_SECRET?.length??0)>=32;}
export function validSession(req:Request){
  if(!hosted)return true;if(!sessionConfigured())return false;
  const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('kuku_session='))?.slice(13);
  if(!cookie)return false;const [expiry,mac]=cookie.split('.');if(!expiry||!mac||!/^\d+$/.test(expiry)||!Number.isFinite(+expiry)||+expiry<Date.now()||mac.length!==64)return false;
  return timingSafeEqual(Buffer.from(mac),Buffer.from(signature(expiry)));
}
export function setSession(res:Response){const expiry=String(Date.now()+12*3600000);res.cookie('kuku_session',expiry+'.'+signature(expiry),{httpOnly:true,secure:hosted,sameSite:'strict',maxAge:12*3600000,path:'/'});}
