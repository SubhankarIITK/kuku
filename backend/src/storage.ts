import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {writeCloudFile,readCloudFile,cloudFiles,remoteStorage} from './cloud.js';
export const root=path.resolve(process.cwd());
export async function save(file:string,value:unknown){
  if(remoteStorage()){await writeText(file,JSON.stringify(value,null,2));return;}
  const dest=path.join(root,file);await mkdir(path.dirname(dest),{recursive:true});const tmp=dest+`.${crypto.randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(value,null,2),'utf8');
  // Windows/OneDrive scanners or short-lived readers can briefly hold the destination.
  // Retry replacement without deleting the last good file or exposing a partial JSON write.
  for(let attempt=0;attempt<10;attempt++)try{await rename(tmp,dest);return;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes((e as NodeJS.ErrnoException).code??'')||attempt===9)throw e;await new Promise(r=>setTimeout(r,Math.min(400,40*2**attempt)));}
}
export async function read<T>(file:string):Promise<T>{return JSON.parse((await readBytes(file)).toString('utf8')) as T;}
function validKey(key:string){if(key.startsWith('/')||key.includes('\\')||key.split('/').includes('..'))throw new Error('Invalid storage key');return key;}
export async function writeText(file:string,content:string){
  if(remoteStorage()){await writeCloudFile(validKey(file),content);return;}
  const dest=path.join(root,file);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,content,'utf8');
}
export async function readBytes(file:string):Promise<Buffer>{
  if(!remoteStorage())return readFile(path.join(root,file));
  return readCloudFile(validKey(file));
}
export async function storedFiles(prefix:string):Promise<string[]>{
  if(remoteStorage()){
    return cloudFiles(validKey(prefix));
  }
  const out:string[]=[];async function walk(dir:string){for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){if(e.isSymbolicLink())continue;const name=dir+'/'+e.name;if(e.isDirectory())await walk(name);else if(e.isFile())out.push(name);}}
  try{await walk(prefix.replace(/\/$/,''));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return out;
}
export async function list(dir:string){
  if(remoteStorage()){const prefix=dir+'/';return (await storedFiles(prefix)).map(s=>s.slice(prefix.length)).filter(s=>!s.includes('/')&&s.endsWith('.json'));}
  try{return (await readdir(path.join(root,dir))).filter(s=>s.endsWith('.json'));}catch{return [];}
}
