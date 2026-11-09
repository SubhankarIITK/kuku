import {hash} from './parser.js';
import {criteria,defaultWeights,type Candidate,type Episode,type Evaluation,type Promo,type ScriptEvent,type Weights} from './types.js';
export const formatTime=(ms:number)=>`${Math.floor(ms/60000).toString().padStart(2,'0')}:${Math.floor(ms/1000%60).toString().padStart(2,'0')}.${(ms%1000).toString().padStart(3,'0')}`;
export function makeCandidate(ep:Episode,startMs:number,endMs:number):Candidate {
  const inside=ep.events.filter(e=>e.startMs<endMs&&e.endMs>startMs);
  return {id:`ep${ep.number}_${startMs}_${endMs}`,segments:[{episode:ep.number,startMs,endMs}],eventIds:inside.map(e=>e.id),contextEventIds:ep.events.filter(e=>(e.startMs>=Math.max(0,startMs-10000)&&e.endMs<=startMs)||(e.startMs>=endMs&&e.endMs<=endMs+10000)).map(e=>e.id),durationMs:endMs-startMs,generationMethod:'event-boundary-enumeration-v1'};
}
export function validate(c:Candidate,episodes:Episode[],e?:Evaluation):string[] {
  const errors:string[]=[];let duration=0;const visible=new Set<string>();
  if(!c.segments.length)errors.push('No segments');
  for(let i=0;i<c.segments.length;i++){
    const s=c.segments[i],ep=episodes.find(ep=>ep.number===s.episode);
    if(!ep){errors.push('Unknown episode');continue;}
    if(!Number.isInteger(s.startMs)||!Number.isInteger(s.endMs)||s.startMs<0||s.endMs>ep.durationMs||s.endMs<=s.startMs)errors.push('Invalid timestamp range');
    if(!ep.events.some(e=>e.startMs===s.startMs)&&!ep.scenes.some(sc=>sc.startMs===s.startMs))errors.push('Start is not a source event or scene boundary');
    if(!ep.events.some(e=>e.endMs===s.endMs)&&!ep.scenes.some(sc=>sc.endMs===s.endMs))errors.push('End is not a source event or scene boundary');
    if(ep.events.some(e=>e.type==='dialogue'&&((e.startMs<s.startMs&&e.endMs>s.startMs)||(e.startMs<s.endMs&&e.endMs>s.endMs))))errors.push('Cut intersects dialogue');
    duration+=s.endMs-s.startMs;
    for(const p of c.segments.slice(0,i))if(p.episode===s.episode&&p.startMs<s.endMs&&s.startMs<p.endMs)errors.push('Repeated overlapping segments');
    for(const event of ep.events)if(event.startMs<s.endMs&&event.endMs>s.startMs)visible.add(event.id);
  }
  if(duration<20000||duration>60000)errors.push('Duration outside 20–60 seconds');
  if(duration!==c.durationMs)errors.push('Duration mismatch');
  if(c.eventIds.some(id=>!visible.has(id)))errors.push('Nonexistent or out-of-clip event reference');
  if(e){
    if(e.candidateId!==c.id)errors.push('Candidate ID mismatch');
    for(const key of criteria){
      if(!Number.isFinite(e.scores[key])||e.scores[key]<0||e.scores[key]>10)errors.push(`Invalid ${key} score`);
      const ids=e.evidence[key].evidenceEventIds;
      if(!ids.length||ids.some(id=>!visible.has(id)))errors.push(`Unsupported ${key} evidence`);
      if(key==='hook'&&ids.some(id=>!episodes.flatMap(ep=>ep.events).some(ev=>ev.id===id&&c.segments.some(s=>s.episode===ev.episode&&ev.startMs<s.startMs+3000&&ev.endMs>s.startMs))))errors.push('Hook evidence outside first 3 seconds');
      if(key==='cliffhanger'&&ids.some(id=>!episodes.flatMap(ep=>ep.events).some(ev=>ev.id===id&&c.segments.some(s=>s.episode===ev.episode&&ev.endMs>s.endMs-5000&&ev.startMs<s.endMs))))errors.push('Cliffhanger evidence outside final 5 seconds');
    }
  }
  return [...new Set(errors)];
}
export function overlap(a:Candidate,b:Candidate):number {
  let intersection=0;for(const x of a.segments)for(const y of b.segments)if(x.episode===y.episode)intersection+=Math.max(0,Math.min(x.endMs,y.endMs)-Math.max(x.startMs,y.startMs));
  return intersection/(a.durationMs+b.durationMs-intersection||1);
}
const drama=/\b(kill|poison|betray|secret|never|marry|dead|die|arrest|slap|struck|threat|blood|shocked|reveal|scream|terrified|truth|duke|love|afraid|danger)\w*\b/ig;
const tension=/\?|\b(secret|threat|danger|unanswered|horrified|stunned|shock|gasp|door|suddenly|interrupt|cut to black|who|why|what)\b/ig;
const count=(s:string,re:RegExp)=>[...s.matchAll(re)].length;
const clamp=(n:number)=>Math.max(0,Math.min(10,Math.round(n*10)/10));
export function heuristic(c:Candidate,ep:Episode):Evaluation {
  const s=c.segments[0],events=ep.events.filter(e=>c.eventIds.includes(e.id));
  const first=events.filter(e=>e.startMs<s.startMs+3000&&e.endMs>s.startMs),last=events.filter(e=>e.endMs>s.endMs-5000);
  const meaningful=(es:ScriptEvent[])=>es.filter(e=>e.type!=='camera').length?es.filter(e=>e.type!=='camera'):es;
  const opening=meaningful(first),closing=meaningful(last);
  const a=opening.map(e=>e.text).join(' '),b=closing.map(e=>e.text).join(' '),all=events.filter(e=>e.type!=='camera').map(e=>e.text).join(' ');
  const speakers=new Set(events.filter(e=>e.speaker).map(e=>e.speaker));
  const scores={hook:clamp(3+Math.min(4,count(a,drama)*1.3)+Math.min(2,count(a,tension))+(first.some(e=>e.type==='dialogue')?.5:0)),cliffhanger:clamp(3+Math.min(5,count(b,tension)*1.4)+Math.min(1.5,count(b,drama)*.5)),standaloneClarity:clamp(8-Math.max(0,speakers.size-3)*.8-(/^(?:["“])?(?:and|but|yes|no|he|she|it|that)\b/i.test(a)?1.2:0)),emotionalImpact:clamp(3+Math.min(6,count(all,drama)*.45)),pacing:clamp(4+Math.min(4,events.filter(e=>e.type==='dialogue').length/(c.durationMs/1000)*9))};
  const evidence=(es:ScriptEvent[],description:string)=>({description,evidenceEventIds:(es.length?es:events).slice(0,3).map(e=>e.id)});
  return {candidateId:c.id,scores,evidence:{hook:evidence(opening,opening[0]?.text??'No opening evidence'),cliffhanger:evidence(closing,closing.at(-1)?.text??'No ending evidence'),standaloneClarity:evidence(events.filter(e=>e.type==='dialogue'),`${speakers.size} speaking characters; semantic clarity needs review.`),emotionalImpact:evidence(events.filter(e=>count(e.text,drama)>0),`Dramatic-word matches; emotional meaning is unverified.`),pacing:evidence(events.slice(0,3),`${events.filter(e=>e.type==='dialogue').length} dialogue events across ${(c.durationMs/1000).toFixed(1)} seconds.`)},reason:'Event-boundary shortlist using opening and ending cues. An editor must confirm the narrative remains unresolved.',weaknesses:['Heuristic scores are lexical signals, not AI judgments.','Unresolved tension and standalone clarity are not semantically verified.'],confidence:null,source:'heuristic',model:'deterministic-lexical-v1'};
}
export function weighted(e:Evaluation,weights:Weights=defaultWeights):number {
  const sum=criteria.reduce((n,k)=>n+weights[k],0);if(sum<=0||criteria.some(k=>weights[k]<0||!Number.isFinite(weights[k])||!Number.isFinite(e.scores[k])))throw new Error('Invalid scores or weights');
  return Math.round(criteria.reduce((n,k)=>n+e.scores[k]*weights[k],0)/sum*100)/100;
}
export function enumerate(ep:Episode):Candidate[] {
  const dialogue=ep.events.filter(e=>e.type==='dialogue');
  const starts=[...new Set([...ep.events.filter(e=>e.type!=='camera').map(e=>e.startMs),...ep.scenes.map(s=>s.startMs).filter((s):s is number=>s!==null)])].sort((a,b)=>a-b);
  const ends=[...new Set(ep.events.map(e=>e.endMs))].sort((a,b)=>a-b);
  const safe=(t:number)=>!dialogue.some(e=>e.startMs<t&&e.endMs>t);
  const out:Candidate[]=[];
  for(const a of starts)if(safe(a))for(const b of ends){if(b-a<20000)continue;if(b-a>60000)break;if(safe(b)){const c=makeCandidate(ep,a,b);if(!validate(c,[ep]).length)out.push(c);}}
  return out;
}
export function shortlist(all:Candidate[],ep:Episode,limit=6):Candidate[] {
  const ranked=all.map(c=>({c,score:weighted(heuristic(c,ep))})).sort((a,b)=>b.score-a.score||a.c.id.localeCompare(b.c.id));
  const selected:Candidate[]=[];for(const {c} of ranked)if(!selected.some(p=>overlap(c,p)>.62)){selected.push(c);if(selected.length>=limit)break;}
  return selected;
}
export function neighbors(c:Candidate,all:Candidate[]):Candidate[] {
  const s=c.segments[0];return all.filter(x=>x.id!==c.id&&Math.abs(x.segments[0].startMs-s.startMs)<=5000&&Math.abs(x.segments[0].endMs-s.endMs)<=5000&&overlap(x,c)>.6);
}
export function rank(promos:Promo[],weights:Weights=defaultWeights):Promo[] {
  const remaining=promos.filter(p=>!p.validation.length&&p.evaluation.scores.hook>=3&&p.evaluation.scores.cliffhanger>=3&&p.evaluation.scores.standaloneClarity>=3).map(p=>({...p,score:weighted(p.evaluation,weights)}));
  const out:Promo[]=[];
  while(remaining.length){
    remaining.sort((a,b)=>(b.score-penalty(b))-(a.score-penalty(a))||a.id.localeCompare(b.id));
    const p=remaining.shift()!;if(out.some(x=>overlap(x,p)>.65))continue;
    p.diversityPenalty=penalty(p);p.rank=out.length+1;out.push(p);
  }
  function penalty(p:Promo){return Math.min(.3,out.filter(x=>x.segments[0].episode===p.segments[0].episode).length*.1);}
  return out;
}
export function boundaryWarnings(c:Candidate,ep:Episode):string[] {
  const s=c.segments[0];const warnings=['Script timings are not frame-accurate; verify against footage.'];
  if(ep.events.some(e=>e.type==='action'&&((e.startMs<s.startMs&&e.endMs>s.startMs)||(e.startMs<s.endMs&&e.endMs>s.endMs))))warnings.push('Cut intersects an action; inspect continuity.');
  if(ep.scenes.filter(sc=>sc.startMs!==null&&sc.startMs>s.startMs&&sc.startMs<s.endMs).length)warnings.push('Scene transition inside clip; check standalone continuity.');
  if(ep.warnings.length)warnings.push('Source episode has parsing warnings.');return warnings;
}
export const fingerprint=(x:unknown)=>hash(JSON.stringify(x));
