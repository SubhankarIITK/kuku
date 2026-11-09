# Observed failures and how to inspect them

These examples were observed in actual model responses. They are not invented human quality labels, audience benchmarks or proof that the advanced method is better than the baseline. Exact script evidence remains in private run artifacts; this document does not reproduce company dialogue.

## 1. Sub-second boundary overinterpretation

In the full-pack run's episode-1 batch, the model increased cliffhanger and standalone-clarity scores when the end moved from 107,300ms to 107,400ms. Its explanation referred to an extra frame and added context. The alternative has the same narrative event evidence. Script-level timings cannot justify that semantic claim or an asserted extra video frame.

Cause: subjective score noise plus a model treating tiny timestamp differences as meaningful content changes. Improvement: the boundary guard rejects sub-second score-only changes when the included non-camera event IDs are unchanged. It preserves the original cut and its original evaluation, while retaining both raw responses and the initial processed ranking. This guard is intentionally narrow; it does not prove other score differences are reliable.

Episode-2 and episode-5 responses made similar claims about 100ms and 300ms extensions. Since dialogue-cut validation already excludes split spoken lines, explanations claiming that such a tail completes a previously truncated line need scrutiny.

## 2. Promo rubric drift

The episode-3 original candidate (11,200–43,300ms, 32.1s) was described as long for a promo and at risk of viewer fatigue, despite the explicit 20–60s requirement. That statement is a model judgment with no measured retention evidence. The duration is valid; the explanation is not an established failure of that clip.

Cause: general advertising assumptions overriding the specific rubric. Improvement: keep duration validity deterministic, retain contradictory explanations for review, and ask editors whether actual pacing is weak. Do not manufacture engagement measurements from the model's text.

## 3. Missing standalone context

The episode-1 advanced original scored standalone clarity 5/10, while the model noted dependence on earlier context. It was shortlisted because lexical dramatic cues were strong, not because a new viewer's understanding was established.

Cause: lexical discovery can prefer emotional dialogue that lacks relationship setup. Improvement: inspect only the included timeline, compare a different opening, or reject the clip. Hidden loglines and continuity notes cannot raise viewer clarity. The direct baseline sees the whole episode and may find a better opening; the comparison does not assume the advanced system wins.

## 4. Source timing inconsistency

Episode 22, event 23, extends beyond its scene's declared end. The parser flags the discrepancy and preserves the event; it does not clamp timing or rewrite the source. Possible improvement: reconcile the script against production footage. No video was supplied, so this remains an editorial warning rather than a repaired timestamp.

## 5. Operational failures encountered

- The first parser regex matched scene metadata as new scene headers, producing 400 scenes. Numeric scene-header matching corrected this to the verified 100. A regression test covers it.
- The initial episode-1 AI smoke test completed advanced scoring but locally rejected the baseline request because the verbose prompt estimate exceeded the configured minute budget. It made no baseline provider call. Compact event tuples made complete-episode baseline requests fit the request budget; the partial smoke run is retained separately from the full run.
- A repeated HTTP integration check hit a transient OneDrive/Windows rename lock on a job file. Bounded retries now retain the previous complete JSON file and retry atomic replacement. The subsequent 20-check HTTP run passed.
- Browser QA was unavailable because the browser access host/native pipe could not be connected. Build and HTTP verification are completed independently; visual interface correctness is not claimed.

The full final run includes its own raw error log and validity measurements. Use `comparison.json` for matched-episode cuts, `blind_review.json` for an unlabeled evidence pack, and `blind_review_key.json` only after a reviewer has recorded judgments. No blind review has been fabricated.
