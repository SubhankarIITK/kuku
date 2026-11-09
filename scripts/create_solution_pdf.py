"""Render the two-page solution from a real, explicitly selected run."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path('tmp/python').resolve()))
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4

run_id=sys.argv[1]
run=json.loads(Path('outputs',run_id,'run.json').read_text(encoding='utf-8'))
m=run['metrics']; manifest=run['manifest']; usage=m.get('usage') or {}
out=Path('output/pdf/kuku-solution.pdf');out.parent.mkdir(parents=True,exist_ok=True)
green=colors.HexColor('#294b3c'); coral=colors.HexColor('#bd6b4e');muted=colors.HexColor('#70816d');cream=colors.HexColor('#f5f7f0')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='KTitle',fontName='Helvetica-Bold',fontSize=28,leading=31,textColor=green,spaceAfter=9))
styles.add(ParagraphStyle(name='KSub',fontName='Helvetica',fontSize=10,leading=15,textColor=muted,spaceAfter=16))
styles.add(ParagraphStyle(name='KEye',fontName='Helvetica-Bold',fontSize=8,leading=11,textColor=coral,spaceAfter=10))
styles.add(ParagraphStyle(name='KH',fontName='Helvetica-Bold',fontSize=11,leading=15,textColor=green,spaceBefore=13,spaceAfter=6))
styles.add(ParagraphStyle(name='KB',fontName='Helvetica',fontSize=9.1,leading=13.3,textColor=green,spaceAfter=6))
styles.add(ParagraphStyle(name='KSmall',fontName='Helvetica',fontSize=7.7,leading=11,textColor=muted,spaceAfter=5))
story=[]
def p(s,style='KB'):return Paragraph(s,styles[style])
def add(s,style='KB'):story.append(p(s,style))
def heading(s):add(s,'KH')
def table(rows,widths,header=True):
    t=Table([[p(str(c),'KSmall' if i==0 and header else 'KB') for c in row] for i,row in enumerate(rows)],colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),7),('BACKGROUND',(0,0),(-1,0),cream),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#dfe6d6'))]))
    story.append(t)
add('KUKU / AI GENERALIST ASSIGNMENT / PROBLEM 1','KEye')
add('Promo Intelligence','KTitle')
add('From Screenplay to Scroll-Stopping Promos.<br/>A private editorial shortlist, with traceable cuts and explicit uncertainty.','KSub')
heading('Why this problem and scope')
add('Editors repeat the same discovery task for every show. A narrow tool can reduce the search space while leaving the final decision with the editor. This prototype finds continuous 20-60 second cuts across the supplied pack; it does not edit video or generate scenes.')
table([['INPUT COVERAGE','REAL-BOUNDARY SEARCH','RANKED OUTPUT'],[f"{m['episodesAttempted']} / {m['episodesDiscovered']} episodes<br/>{m['events']:,} timed events",f"{m['enumeratedCandidates']:,} valid intervals<br/>{m['evaluatedCandidates']} cut evaluations",f"{len(run['promos'])} suggestions<br/>Mode: {manifest['mode']}<br/>Status: {manifest['status']}"]],[166,166,167])
heading('Approach: AI judgment inside deterministic constraints')
add('<b>ZIP &gt; parser &gt; event timeline &gt; candidate discovery &gt; AI scoring &gt; boundary comparison &gt; validation &gt; ranking &gt; editor.</b> React/Vite presents the local workspace; Express/TypeScript runs the engine; JSON stores runs and annotations.')
add('The parser preserves source text, lines, original centisecond clocks and legitimate overlapping camera/action/dialogue tracks. Starts and ends come from actual events. Enumeration excludes split dialogue, and lexical discovery keeps model calls bounded. Every episode is attempted.')
add('Groq <b>openai/gpt-oss-120b</b> evaluates a shortlisted interval and a neighboring alternative together. It scores opening hook, unresolved ending, standalone clarity, emotion and pacing, with included event IDs for each. Hidden continuity notes are labeled separately. Zod and deterministic checks reject invented IDs, out-of-clip evidence, invalid clocks and invalid durations.')
add('Weighted scores (30/30/20/15/5) are configurable editorial heuristics. Ranking gates critically weak essentials, suppresses near duplicates and exposes diversity deductions. A sub-second score increase without new narrative event evidence does not justify changing the cut. Original and alternative evaluations remain inspectable.')
heading('Assumptions and confidentiality')
add('Timestamps are episode-relative script positions, not verified video frames. A selected event may overlap a cut; an editor must confirm actual delivery and action continuity. Multiple segments are supported by the model/validator, but generation stays continuous. Private scripts, responses and keys are excluded from source and browser bundles; Groq transfer was explicitly authorized by the owner.')
story.append(PageBreak())
add('MEASURED RESULTS / LIMITS / REPRODUCIBILITY','KEye')
add('Evidence before confidence.','KTitle')
sample=m.get('baselineSampleEpisodes',[])
heading('Baseline comparison and quality checking')
add('The independent direct-selection baseline sees complete episodes and the same promo requirements using the same model. The structured pipeline sees systematically generated cuts. Comparison episodes: '+', '.join(map(str,sample))+'. Advanced validation/repair and direct baseline use different inference budgets; validity does not establish superior selection quality.')
table([['MEASURE','STRUCTURED PIPELINE','DIRECT BASELINE'],['Suggestions before ranking',str(m['advancedSuggestions'])+' (all attempted episodes)',str(m['baselineSuggestions'])+' (sample)'],['Invalid suggestions',m['advancedInvalid'],m['baselineInvalid']],['Comparable sample suggestions',m.get('comparableAdvancedSuggestions','n/a'),m['baselineSuggestions']],['Human quality comparison','Pending; no invented labels','Pending; no winner claimed']],[190,155,154])
add(f"Run: {m['elapsedMs']/1000:.1f}s elapsed; {usage.get('calls',0)} model calls, {usage.get('cached',0)} cache hits, {usage.get('retries',0)} retries. Provider-reported input/output: {usage.get('inputTokens',0):,} / {usage.get('outputTokens',0):,} tokens. Cost is not estimated. Zero human reviews were fabricated.",'KSmall')
heading('Actual failures and practical limits')
add('<b>Boundary score noise:</b> actual responses claimed improved clarity from 100-300ms extensions without new narrative evidence. Those responses are preserved; an evidence guard retains the original. <b>Rubric drift:</b> one response called a 32-second clip long despite the allowed range. Generated explanations require editorial scrutiny.')
add('<b>Input warning:</b> one episode-22 event exceeds its declared scene end. It is retained and flagged. <b>Recall:</b> lexical pruning and one candidate per episode can miss better scenes. <b>Evaluation:</b> validity and AI scores are measured, but real human preference, audience retention and frame accuracy are not established. Browser visual verification was unavailable; HTTP checks do not prove layout quality.')
heading('Free-tier scale and reuse')
add('The free-tier profile uses serial requests, compact shared-event prompts, cached structured results, bounded retries, a 7,500-token/minute pacing limit and a 190,000-token local daily budget. Provider quotas and other account usage still apply. There is no automatic paid fallback. Re-running identical input/settings reuses cache; new shows use the same parser and provider interface. Production needs durable queues, account-wide quotas, access control and video alignment, rather than more agent frameworks.')
heading('AI tools, a real mistake, and deliverables')
add('Codex assisted implementation, tests and documentation; Groq supplies runtime semantic evaluation. An AI-written parser regex initially counted scene metadata as new scenes (400 instead of 100); source inspection exposed the bug, the numeric-header rule fixed it, and a regression test protects it. The owner should understand and adapt the work before interview.')
add('Deliverables: runnable local app, source-only archive, private raw run folder, measured verification notes and a three-minute demo outline. Owner steps: inspect/review suggestions, record the optional walkthrough in their own voice, add personal details, and submit authorized links via the placement form.','KSmall')
def footer(canvas,doc):
    canvas.setStrokeColor(colors.HexColor('#dfe6d6'));canvas.line(48,43,A4[0]-48,43);canvas.setFillColor(muted);canvas.setFont('Helvetica',7);canvas.drawString(48,29,'Kuku Promo Intelligence | Local prototype | 6 November 2026');canvas.drawRightString(A4[0]-48,29,str(doc.page))
SimpleDocTemplate(str(out),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=42,bottomMargin=56,title='Kuku Promo Intelligence - Solution',author='Assignment prototype').build(story,onFirstPage=footer,onLaterPages=footer)
print(out.resolve())
