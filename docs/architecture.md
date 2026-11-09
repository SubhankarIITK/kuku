# Architecture and tradeoffs

React/Vite/strict TypeScript presents a private local editorial workspace. Express serves API responses on loopback only. A production build is also served by Express, so `npm run start` is sufficient after `npm run build`. Tailwind is integrated; Lucide supplies interface icons. There are no external fonts, analytics, auth systems, databases or agent frameworks.

## Processing

1. Read ZIP entries in memory, with entry count, compressed upload, per-file and total expanded limits. Reject unsafe paths and duplicate episode identities. Never extract arbitrary uploaded paths to disk.
2. Parse each file into scenes and timed events; preserve source lines, original clocks, labels, metadata, warnings and rejected records. Report missing episode numbers and files that could not be parsed.
3. Enumerate real-boundary 20–60 second windows across every episode. Exclude cuts through dialogue. Lexical signals prioritize opening conflict, ending questions and dramatic language. High-IoU windows are thinned while retaining distinct alternatives.
4. Offline mode produces explicitly labeled heuristic suggestions. AI mode evaluates the original and one nearby real-boundary alternative together. Events shared by neighboring cuts appear once in a compact payload. Each cut is evaluated independently with temporal evidence checks.
5. Zod validates every model response. Deterministic validation checks IDs, evidence visibility, hook/ending evidence windows, durations, boundary membership, ranges and repeated footage. Bounded repair retries receive validation errors. Invalid advanced results are rejected, not silently passed through.
6. Select a neighboring cut only if it has a higher weighted score. Store both original and selected interval and score. Ranking rejects critically weak essentials below 3, suppresses IoU > 0.65, and applies up to 0.30 diversity deduction for repeated episodes. Display scores stay raw; deductions are exposed. The weights are initial editorial heuristics, not scientifically validated coefficients.
7. A direct-LLM baseline independently sees the complete episode and selects its best clip. It uses the same model, evidence criteria and schema. Baseline raw suggestions are saved before deterministic rejection. The default sample is five evenly spaced episodes; selection quality requires independent human comparison. Advanced repair and direct baseline have different inference budgets, disclosed with measured usage.
8. Human reviews are stored separately, tied to a run and promo. Ratings use 1–5; defaults are not labels until explicitly saved. Stale-run review writes are rejected. Tests use synthetic data, never invented company-script human labels.

## Providers and free-tier operation

`LLMProvider.generateStructured` isolates model access. Gemini REST and Groq's OpenAI-compatible REST API are implemented without provider SDK coupling. On supported Groq models, strict JSON Schema decoding is used; others use JSON object mode plus Zod. Model self-confidence is uncalibrated. GPT-OSS uses low reasoning effort to conserve free tokens; semantic performance remains to be measured by editors.

The recommended Groq model is `openai/gpt-oss-120b`: strict outputs and the same account quota shown for its smaller sibling make it a reasonable initial quality choice, not a proved drama-specific winner. A 131,072-token context window does not override the account's 8,000-token/minute limit. Requests are compact, serial under the configured free-tier profile, locally paced to 7,500 estimated tokens/minute, and bounded by a 190,000-token daily local budget. The budget reserves estimated input plus maximum completion and reconciles completed calls with reported actual usage; incomplete/failed reservations remain conservative. Other applications' usage is not tracked. Provider 429s still take precedence. No alternative paid provider is selected automatically.

The cache key includes model, provider, prompt, schema and prompt version. Unchanged input can reuse parsed datasets and cached model evaluations. Failed or partial runs keep raw responses and cache entries. Restart a run with the same settings to reuse cached calls. Cached responses are marked as cached, not counted as new token consumption. The daily ledger persists separately. Do not delete it to evade a quota.

## Limits and production path

Jobs use a bounded in-process worker and JSON status persistence. Server restart marks unfinished jobs interrupted; it does not promise exactly-once execution or resumable distributed workers. JSON writes use temporary files and rename. This is a single-user local application; do not expose its port to a network. It is not production authentication.

More shows require durable queues, cancellation, immutable run storage, an account-wide distributed rate limiter, access control, audit retention policies, quotas and real video alignment. Selection recall is limited by lexical pruning and a small free-tier shortlist. Add a semantic discovery pass only after human evaluation shows that it recovers missed moments cost-effectively. Wider multi-segment search is deferred until continuous cut quality is established.

## Sources checked

- [Groq models](https://console.groq.com/docs/models)
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs)
- [Groq rate limits](https://console.groq.com/docs/rate-limits)
- [Groq reasoning parameters](https://console.groq.com/docs/reasoning)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

Account limits were checked against the user's screenshot on 6 November 2026. Model availability and quotas may change; the account limits page is authoritative for that account.
