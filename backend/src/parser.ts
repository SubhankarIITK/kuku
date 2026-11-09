import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
import type {Dataset,Episode,ScriptEvent,Scene,Warning,ParsingReport} from './types.js';
export const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export function timestamp(s:string):number {
  const m=/^(?:(\d+):)?(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if(!m || +m[3]>=60 || (m[1]!==undefined && +m[2]>=60)) throw new Error(`Invalid timestamp: ${s}`);
  return ((+(m[1]??0)*3600)+(+m[2]*60)+(+m[3]))*1000+Number((m[4]??'').padEnd(3,'0'));
}
export function parseEpisode(text:string,file:string):Episode {
  const lines=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').split('\n');
  const num=/EPISODE NUMBER:\s*(?:Episode\s*)?(\d+)/i.exec(text)??/episode[-_ ]*(\d+)/i.exec(file);
  if(!num) throw new Error(`Episode number missing in ${file}`);
  const number=+num[1], events:ScriptEvent[]=[], scenes:Scene[]=[], warnings:Warning[]=[], rejectedRecords:Episode['rejectedRecords']=[];
  const warn=(code:string,line:number,message:string)=>warnings.push({code,file,line,message});
  let scene:Scene|undefined;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].trim();
    if(/^SCENE\s+\d+\b/i.test(line)) {scene={id:`ep${number}_scene${scenes.length+1}`,heading:line,startMs:null,endMs:null};scenes.push(scene);continue;}
    if(scene && /^Scene heading:/i.test(line)) scene.heading=line.replace(/^Scene heading:\s*/i,'');
    if(scene && /^Scene (start|end):/i.test(line)) {
      const m=/^Scene (start|end):\s*(.*)/i.exec(line)!;
      try {scene[m[1].toLowerCase()==='start'?'startMs':'endMs']=timestamp(m[2]);}catch{warn('invalid_scene_timestamp',i+1,line);} continue;
    }
    const block=/^\*\*(.+?):\*\*$/.exec(line);
    if(!block) {if(/^Start:/i.test(line)) warn('orphan_timestamp',i+1,line);continue;}
    const start=i;let end=i+1;
    while(end<lines.length&&!/^\*\*.+?:\*\*\s*$/.test(lines[end])&&!/^SCENE\s+\d+\b/i.test(lines[end])&&!/^--- SCRIPT END/.test(lines[end])) end++;
    const raw=lines.slice(start,end).join('\n');
    const tm=/^Start:\s*\(([^)]+)\)\s*\|\s*End:\s*\(([^)]+)\)\s*$/m.exec(raw);
    try {
      if(!tm) throw new Error('Missing or malformed start/end line');
      const a=timestamp(tm[1]),b=timestamp(tm[2]); if(b<=a) throw new Error('End must be after start');
      const label=block[1], type:ScriptEvent['type']=label==='CAMERA'?'camera':label==='ACTION'?'action':/SOUND|MUSIC|SFX|VFX/.test(label)?'other':'dialogue';
      const body=lines.slice(start+1,end).filter(l=>!/^Start:/.test(l)).join('\n').trim();
      if(!body) warn('empty_event',start+1,'Timed record has no content');
      events.push({id:`ep${number}_event${events.length+1}`,episode:number,sceneId:scene?.id??null,type,speaker:type==='dialogue'?label.replace(/\s*\(.*$/,''):undefined,label,text:body,startMs:a,endMs:b,originalStart:tm[1],originalEnd:tm[2],sourceFile:file,sourceLineStart:start+1,sourceLineEnd:end});
    }catch(e){warn('invalid_record',start+1,(e as Error).message);rejectedRecords.push({line:start+1,raw});}
    i=end-1;
  }
  for(const s of scenes) {
    if(s.startMs===null||s.endMs===null||s.endMs<=s.startMs)warn('scene_range',1,`Missing or invalid range: ${s.id}`);
    for(const e of events.filter(e=>e.sceneId===s.id)) if(s.startMs!==null&&s.endMs!==null&&(e.startMs<s.startMs||e.endMs>s.endMs)) warn('outside_scene',e.sourceLineStart,`${e.id} extends outside declared scene`);
  }
  const seen=new Set<string>();for(const e of events){const key=`${e.type}:${e.startMs}:${e.endMs}:${e.text}`;if(seen.has(key))warn('duplicate_event',e.sourceLineStart,e.id);seen.add(key);}
  if(!events.length)warn('empty_episode',1,'No valid timed events');
  return {number,sourceFile:file,sourceHash:hash(text),logline:/^EPISODE LOGLINE:\s*(.*)/m.exec(text)?.[1]??'',continuity:/^CONTINUITY NOTES:\s*(.*)/m.exec(text)?.[1]??'',scenes,events,warnings,rejectedRecords,durationMs:Math.max(0,...events.map(e=>e.endMs),...scenes.map(s=>s.endMs??0))};
}
export function makeDataset(files:{name:string;text:string}[],name:string):Dataset {
  const episodes:Episode[]=[], failures:Warning[]=[];
  for(const f of files)try{episodes.push(parseEpisode(f.text,f.name));}catch(e){failures.push({code:'file_failure',file:f.name,message:(e as Error).message});}
  episodes.sort((a,b)=>a.number-b.number);
  const numbers=new Set<number>();for(const e of episodes){if(numbers.has(e.number))failures.push({code:'duplicate_episode',file:e.sourceFile,message:`Duplicate episode ${e.number}`});numbers.add(e.number);}
  for(let n=1;n<=Math.max(0,...numbers);n++)if(!numbers.has(n))failures.push({code:'missing_episode',file:'archive',message:`Episode ${n} missing`});
  const warnings=[...failures,...episodes.flatMap(e=>e.warnings)];
  let overlapPairs=0;for(const ep of episodes)for(let i=0;i<ep.events.length;i++)for(let j=i+1;j<ep.events.length;j++)if(ep.events[i].startMs<ep.events[j].endMs&&ep.events[j].startMs<ep.events[i].endMs)overlapPairs++;
  const report:ParsingReport={discovered:files.length,parsed:episodes.filter(e=>e.events.length).length,scenes:episodes.reduce((n,e)=>n+e.scenes.length,0),events:episodes.reduce((n,e)=>n+e.events.length,0),invalidRecords:episodes.reduce((n,e)=>n+e.rejectedRecords.length,0),overlapPairs,duplicateEvents:warnings.filter(w=>w.code==='duplicate_event').length,warnings,manualReviewFiles:[...new Set(warnings.map(w=>w.file))]};
  return {id:hash(files.map(f=>f.name+hash(f.text)).sort().join('|')).slice(0,16),name,createdAt:new Date().toISOString(),episodes,report};
}
export function loadZip(buffer:Buffer,name:string):Dataset {
  const zip=new AdmZip(buffer), entries=zip.getEntries();let total=0;
  if(entries.length>2000)throw new Error('Too many archive entries (limit 2000)');
  const files:{name:string;text:string}[]=[];
  for(const e of entries) {
    if(e.isDirectory||e.entryName.split(/[\\/]/).some(p=>p==='__MACOSX'||p.startsWith('._'))||!e.entryName.toLowerCase().endsWith('.txt'))continue;
    if(e.entryName.split(/[\\/]/).includes('..')||/^[\\/]|^[a-z]:/i.test(e.entryName))throw new Error('Unsafe archive path');
    total+=e.header.size;if(total>30_000_000||e.header.size>2_000_000)throw new Error('Archive expanded size exceeds limit');
    files.push({name:e.entryName,text:e.getData().toString('utf8')});
  }
  if(!files.length)throw new Error('No .txt screenplay files found');
  const ds=makeDataset(files,name);if(ds.report.warnings.some(w=>w.code==='duplicate_episode'))throw new Error('Episode numbers must be unique');
  if(!ds.report.parsed)throw new Error('No timestamped episodes could be parsed. Use .txt files with EPISODE NUMBER: Episode 1, **SPEAKER:** and Start: (00:00.00) | End: (00:04.00).');
  return ds;
}
