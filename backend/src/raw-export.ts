import AdmZip from 'adm-zip';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,storedFiles,readBytes} from './storage.js';
import {remoteStorage} from './cloud.js';
import type {Run} from './types.js';

export async function rawOutputArchive(run:Run,workspace=root):Promise<Buffer>{
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(run.id))throw new Error('Invalid run ID');
  const folder=path.join(workspace,'outputs',run.id),zip=new AdmZip();
  const files:{path:string;bytes:number;sha256:string}[]=[];
  async function collect(directory:string,prefix=''){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const relative=prefix+entry.name;
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory()){await collect(path.join(directory,entry.name),relative+'/');continue;}
      if(!entry.isFile()||! /\.(json|csv|txt)$/i.test(entry.name)||entry.name.startsWith('.'))continue;
      const bytes=await readFile(path.join(directory,entry.name));
      zip.addFile(`${run.id}/${relative}`,bytes);
      files.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }
  if(remoteStorage()&&workspace===root){
    const prefix=`outputs/${run.id}/`;for(const key of await storedFiles(prefix)){const relative=key.slice(prefix.length);if(!/\.(json|csv|txt)$/i.test(relative)||relative.split('/').some(p=>p.startsWith('.')))continue;const bytes=await readBytes(key);zip.addFile(`${run.id}/${relative}`,bytes);files.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  }else await collect(folder);
  zip.addFile(`${run.id}/DOWNLOAD_README.txt`,Buffer.from(`Kuku Promo Intelligence - private run output\n\nRun: ${run.id}\nDataset: ${run.datasetId}\nMode: ${run.manifest.mode}\nModel: ${run.manifest.model}\nStatus: ${run.manifest.status}\n\nraw/ contains original saved model responses, cached results and errors where present. Other files contain parsed evidence, candidates, evaluations, processed recommendations and run metadata. Raw response bytes are copied unchanged. Offline runs do not contain AI responses. Running analyses are partial snapshots and can be downloaded again when complete.\n\nConfidential: this archive may contain company screenplay text. Share only with the authorized assignment reviewer. No credentials or environment files are included.\n`));
  zip.addFile(`${run.id}/download_manifest.json`,Buffer.from(JSON.stringify({schemaVersion:'1.0',runId:run.id,datasetId:run.datasetId,mode:run.manifest.mode,model:run.manifest.model,status:run.manifest.status,downloadedAt:new Date().toISOString(),files},null,2)));
  return zip.toBuffer();
}
