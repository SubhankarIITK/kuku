# Free-tier recovery

The app cannot guarantee Groq uptime or unlimited free inference. It keeps useful work available and makes interruptions recoverable.

- Each hosted episode commits a persisted result before the job cursor advances. Repeated/concurrent step requests use leases and check committed episodes to avoid duplicate appends. The dataset pointer is repaired when a previously committed episode is resumed.
- Groq 429 and provider 5xx responses save a shared model cooldown. Hosted processing returns promptly and the open browser advances the job after the retry time. `Retry-After` seconds and HTTP dates are supported.
- Hosted provider retries are capped at one, with a maximum 45-second provider timeout. Invalid-key/configuration responses stop without repeated provider attempts.
- Browser connection errors retry with backoff; they do not change persisted jobs to failed. Failed/interrupted hosted jobs have an explicit Resume action that keeps their cursor and cached responses.
- Local daily budgeting and shared minute reservations reduce accidental overspending. Reservations and reconciliation use atomic increments; late usage adjustments are applied to the original UTC day and do not reduce a later minute window.
- The UI labels its budget as an app estimate. Other usage in the same Groq organization can still cause provider limits. Existing cached responses, exports, reviews and offline analysis do not require fresh inference.

Verification: 29 unit tests, including mocked 429/503/401 responses and cooldown metadata; isolated MongoDB integration checks for same-job resume, concurrent-step deduplication, durable cooldown and quota reconciliation across minute windows. These checks use synthetic records and no real inference. The database check is `npx tsx scripts/verify-recovery.ts --mongodb`; it requires an explicitly configured MongoDB URI and removes only its uniquely identified records.

Limits: a page must remain open for hosted progression; this is not a background queue. In-flight provider requests can consume tokens before a network interruption. Database outages, exhausted storage, malformed inputs and provider quotas remain possible. Existing valid results are preserved when new AI output is unusable. A paused baseline is disclosed as incomplete rather than fabricated or presented as a quality improvement.
