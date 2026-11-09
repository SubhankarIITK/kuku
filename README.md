# Kuku Promo Intelligence

**From Screenplay to Scroll-Stopping Promos.**

A private local editorial tool for Problem 1 of the Kuku AI Generalist Assignment. It parses timestamped screenplay ZIPs, discovers valid promo intervals, evaluates neighboring cuts with a swappable LLM, validates evidence, ranks results, and captures human reviews. Offline mode is a working lexical shortlist, clearly distinguished from AI evaluation.

## Run locally

Requires Node.js 22+ and npm. PowerShell users can use `npm.cmd` if execution policy blocks `npm.ps1`.

```powershell
npm.cmd ci
Copy-Item .env.example .env  # only if .env does not exist
# Add GROQ_API_KEY to .env locally. Do not paste or commit it.
npm.cmd run import -- "C:\path\to\screenplays.zip"
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. The API runs at http://127.0.0.1:3001. The supplied pack is already imported in this workspace. Files under `data/` and `outputs/` are private and ignored by Git.

For a single server after building:

```powershell
npm.cmd run build
npm.cmd start
# Open http://127.0.0.1:3001
```

Use **Datasets & processing** to upload another ZIP. Uploading automatically creates a local shortlist without API calls and opens the library. Re-uploading an analyzed pack reuses its results. The selected dataset survives reloads; each dataset has its own job state. To use AI, explicitly select the AI engine and start analysis. You can also adjust ranking weights and rerun locally. Review exact source evidence from each promo. Exports are available from the library's Export menu. No screenplay text is embedded in browser build assets.

## Analysis and validation commands

```powershell
npm.cmd run analyze                  # all episodes; deterministic heuristic mode
npm.cmd run analyze -- --ai          # all episodes; configured provider
npm.cmd run analyze -- --ai --dataset=DATASET_ID
npm.cmd test                        # synthetic deterministic tests; mock model integration
npm.cmd run build                   # strict typecheck + production build
npx.cmd tsx scripts/verify-api.ts    # HTTP integration checks; requires npm run dev
npx.cmd tsx scripts/verify-upload.ts # new ZIP, concurrent packs, reuse and local reruns; no Groq calls
```

The verification script uploads a synthetic screenplay, runs analysis, exercises reviews and exports, then removes only its synthetic dataset/review records. These are automated checks, not human quality labels. `smoke-ai.ts` and `prompt-budget.ts` are workspace audit helpers for the provided dataset; ordinary import/analyze commands work for new packs.

## Groq free-tier profile

The selected model is **`openai/gpt-oss-120b`**, called through Groq, not OpenAI's API. The user's account screenshot lists 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute and 200,000 tokens/day. Model context capacity is a separate constraint.

The `.env.example` profile uses one shortlisted candidate and one nearby alternative per episode, batched into one model request; an independent direct-selection baseline runs on five evenly spaced episodes. One run covers every episode with the advanced engine; the baseline is a representative sample, not a second full-pack run. Increase `BASELINE_SAMPLE_SIZE` only within your available quota. There is no automatic switch to a paid service.

Local safeguards: 7,500 tokens/minute, 190,000 reserved/reconciled tokens/day, 2,000 maximum completion tokens, bounded retries, and one worker. A provider 429 can still occur because token estimates are approximate and account usage elsewhere is unknown. If a quota stops the run, its status is partial; rerun identical inputs/settings after reset to use cached responses. Never treat missing results as successful coverage. Secrets are server-only environment variables.

## What the engine does

- Parses exact centisecond timestamps into integer milliseconds, preserving original clocks, source text/line numbers, scene structure, metadata, overlaps and invalid records.
- Enumerates 20–60 second intervals at real boundaries, excluding split dialogue; lexical prefiltering and overlap suppression keep inference bounded.
- Scores hook, cliffhanger, standalone clarity, emotion and pacing. AI judgments cite included event IDs; hook and ending citations must intersect the opening three/final five seconds.
- Keeps viewer-visible content distinct from hidden continuity/background notes.
- Compares neighboring start/end alternatives and preserves the original when no evaluated cut improves it.
- Applies configurable weighted ranking, essential-quality gates, near-duplicate suppression and a disclosed diversity deduction.
- Preserves model responses before post-processing, validates baseline separately, and stores editorial reviews independently.

## Deliverables and evidence

- `docs/input_analysis.md`: actual pack grammar, observations and assumptions.
- `docs/architecture.md`: pipeline, provider abstraction, cost controls, limits and production path.
- `docs/demo_outline.md`: owner-recorded three-minute demo plan and submission steps.
- `docs/verification.md`: measured execution results and verification limits (prepared after the final run).
- `output/pdf/kuku-solution.pdf`: maximum-two-page solution explanation (generated after final analysis).
- `outputs/<run-id>/`: private immutable run artifacts: `raw/`, `parsed.json`, `candidates.json`, `evaluations.json`, `promos.json`, `promos.csv`, `rankings.json`, `evaluation.json`, `failures.json`, `run_manifest.json`, `run.json`.
- `data/reviews/<run-id>/`: human annotations, separate from generated judgments.

Raw run folders include private evidence. Share them only with the authorized assignment reviewer; do not include them in a public source repository. A source-only ZIP is prepared separately for review and excludes private data and secrets. New users must import their own authorized screenplay pack.

## Current limitations

Continuous generation only; ordered multi-segment validation is implemented but unrestricted assembly is deferred. Script times are not video frame verification. Lexical pruning can miss strong scenes and overvalue questions or dramatic words. Scores and model confidence are subjective, not calibrated or validated against audience engagement. Human baseline comparison requires real reviewers and has not been fabricated. The local worker/JSON store is not a distributed production service. UI visual verification requires an available browser; direct HTTP checks do not establish visual layout quality.

See `docs/verification.md` for actual completed runs, token usage, failures and any unfinished work. The owner must understand and adapt the work, add personal submission details, record the optional video, and submit through the placement form.

### AI availability and free-tier fallback

When the preferred GPT-OSS 120B local budget cannot fit a request, health status recommends GPT-OSS 20B if its separate local ledger has room. The 20B connection was verified with one 209-token request; provider/account quotas still apply. New analyses record the actual selected model. No paid provider is selected, and no AI request happens just from uploading: uploads create the local shortlist; press Run AI analysis to score it. The configuration opens ready for AI with one candidate per episode. Budget status refreshes every 30 seconds and on window focus. The local budget day is UTC (05:30 IST); Groq may enforce its own reset schedule.

### Download raw output

In the Promo library, select the screenplay, open **Export**, and choose **Download raw output (.zip)**. The ZIP is pinned to the run currently displayed, preserves saved raw response files byte-for-byte, and includes parsed evidence, candidates, evaluations, result exports, validation/failure reports, run metadata and a checksum manifest. Offline runs contain heuristic artifacts rather than AI responses. Running runs are partial snapshots. The archive contains confidential evidence and must only be shared with an authorized reviewer. No Groq calls are made by downloading.

## Vercel deployment with MongoDB Atlas

Both the frontend and Express API can be deployed in one Vercel project. See [the complete deployment guide](docs/deploy-vercel.md) for Atlas setup, environment variables, password-free shared access, chunked ZIP uploads and resumable analysis. The hosted database adapter is enabled by Vercel or `STORAGE_BACKEND=mongodb`; local JSON storage remains the default on your computer. No private local datasets are uploaded automatically. A live Vercel/Atlas deployment still needs your account configuration and has not been claimed as verified.
