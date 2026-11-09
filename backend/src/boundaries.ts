import type {Candidate,Episode,Evaluation,Promo} from './types.js';
import {boundaryWarnings,validate,weighted} from './engine.js';
import type {Weights} from './types.js';
export function meaningfulChange(original:Candidate,selected:Candidate,ep:Episode):boolean {
  const a=original.segments[0],b=selected.segments[0];
  if(Math.max(Math.abs(a.startMs-b.startMs),Math.abs(a.endMs-b.endMs))>=1000)return true;
  const narrative=(c:Candidate)=>ep.events.filter(e=>e.type!=='camera'&&c.eventIds.includes(e.id)).map(e=>e.id).join('|');
  return narrative(original)!==narrative(selected);
}
export function guardBoundary(p:Promo,episodes:Episode[],evaluations:Evaluation[],weights:Weights):Promo {
  const comparison=p.boundaryComparison;if(!comparison||comparison.original.id===p.id)return p;
  const ep=episodes.find(e=>e.number===p.segments[0].episode)!;
  if(meaningfulChange(comparison.original,p,ep))return p;
  const evaluation=evaluations.find(e=>e.candidateId===comparison.original.id);if(!evaluation)return p;
  return {...comparison.original,evaluation,score:weighted(evaluation,weights),rank:0,validation:validate(comparison.original,episodes,evaluation),diversityPenalty:0,warnings:[...boundaryWarnings(comparison.original,ep),'Tiny alternative cut added no narrative event evidence; retained original despite the model score difference.'],boundaryComparison:{original:comparison.original,originalScore:weighted(evaluation,weights),selectedScore:weighted(evaluation,weights),reason:'Rejected sub-second score-only improvement without new dialogue/action evidence. Exact microtiming requires footage review.'}};
}
