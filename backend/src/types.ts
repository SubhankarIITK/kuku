export interface ScriptEvent {
  id:string; episode:number; sceneId:string|null; type:'dialogue'|'action'|'camera'|'other';
  speaker?:string; label:string; text:string; startMs:number; endMs:number; originalStart:string; originalEnd:string;
  sourceFile:string; sourceLineStart:number; sourceLineEnd:number;
}
export interface Scene {id:string; heading:string; startMs:number|null; endMs:number|null}
export interface Warning {code:string; file:string; line?:number; message:string}
export interface Episode {number:number; sourceFile:string; sourceHash:string; logline:string; continuity:string; scenes:Scene[]; events:ScriptEvent[]; warnings:Warning[]; rejectedRecords:{line:number;raw:string}[]; durationMs:number}
export interface Dataset {id:string; name:string; createdAt:string; episodes:Episode[]; report:ParsingReport}
export interface ParsingReport {discovered:number; parsed:number; scenes:number; events:number; invalidRecords:number; overlapPairs:number; duplicateEvents:number; warnings:Warning[]; manualReviewFiles:string[]}
export interface Segment {episode:number; startMs:number; endMs:number}
export interface Candidate {id:string; segments:Segment[]; eventIds:string[]; contextEventIds:string[]; durationMs:number; generationMethod:string; originalId?:string}
export const criteria=['hook','cliffhanger','standaloneClarity','emotionalImpact','pacing'] as const;
export type Scores=Record<typeof criteria[number],number>;
export type Weights=Scores;
export const defaultWeights:Weights={hook:.30,cliffhanger:.30,standaloneClarity:.20,emotionalImpact:.15,pacing:.05};
export interface Evidence {description:string; evidenceEventIds:string[]}
export interface Evaluation {candidateId:string; scores:Scores; evidence:Record<typeof criteria[number],Evidence>; reason:string; weaknesses:string[]; confidence:number|null; source:'heuristic'|'llm'; model:string}
export interface Promo extends Candidate {evaluation:Evaluation; score:number; rank:number; validation:string[]; warnings:string[]; boundaryComparison?:{original:Candidate; originalScore:number; selectedScore:number; reason:string}; diversityPenalty:number}
export interface Review {promoId:string; runId:string; ratings:Record<'hook'|'cliffhanger'|'clarity'|'boundaries'|'usefulness',number>; label:string; notes:string; updatedAt:string}
export interface Job {id:string; datasetId:string; status:'queued'|'running'|'complete'|'failed'|'interrupted'; progress:number; stage:string; error?:string; runId?:string; createdAt:string}
export interface Run {id:string; datasetId:string; manifest:Record<string,unknown>; promos:Promo[]; baseline:Promo[]; candidates:Candidate[]; evaluations:Evaluation[]; metrics:Record<string,unknown>; failures:Record<string,unknown>[]}
