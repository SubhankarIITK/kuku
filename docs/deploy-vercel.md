# Deploy frontend and backend to Vercel with MongoDB Atlas

The repository now contains a Vite frontend and an Express API in **one Vercel project**. API routes live under `/api`; the frontend uses the same origin, so a separate backend URL or frontend API key is unnecessary. `vercel.json` supplies the build command, output folder, API routing and a 300-second function limit.

This preparation has been built and tested locally. It has **not** been deployed to your Vercel account, and no live Atlas connection has been tested without your database credentials. Existing local scripts/results are not uploaded automatically.

## 1. Create MongoDB Atlas storage

1. Create an Atlas project and a free cluster if available to your account.
2. Create a dedicated database user with `readWrite` access to a database named `kuku_promo`. Use a strong generated password, separate from your Atlas login.
3. Use Atlas **Connect > Drivers > Node.js** to copy the connection URI. Replace the password placeholder; URL-encode special characters in the password.
4. Configure Atlas Network Access for your Vercel deployment. Standard Vercel deployments use changing outbound IP addresses. If your plan provides fixed egress, allowlist those addresses. Allowing `0.0.0.0/0` is a broader-access alternative, not a private-network configuration: use a dedicated least-privilege database user, TLS and strong credentials. Do not change a production cluster's network policy without understanding this tradeoff.

Collections and indexes are created by the application. No SQL setup or Supabase account is needed. Small records are stored in `files`; records above 8 MB use GridFS (`large_files.files` and `large_files.chunks`) to stay below MongoDB's document-size limit. `leases` coordinates requests across Vercel instances, `quota` tracks token reservations, and temporary ZIP upload chunks have TTL indexes. Old GridFS versions are retained for safe concurrent reads; monitor storage usage and add a retention job before sustained production use.

## 2. Upload source to your repository

Push source code and `package-lock.json` to a private GitHub repository. Exclude `.env`, `data/`, `outputs/`, `output/`, `tmp/`, `.vercel/`, submission archives and the confidential ZIP. The `.vercelignore` also excludes those paths from deployment uploads.

## 3. Import into Vercel

Import the repository into a new Vercel project. Use the repository root as the Root Directory.

| Setting | Value |
| --- | --- |
| Framework preset | Other (the repository's `vercel.json` handles routing) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm ci --include=dev` (also set in `vercel.json`) |
| Node.js | 22.x |
| Fluid Compute | Enabled; the API requests up to 300 seconds |

Set these **server-only** environment variables for Production and, if wanted, Preview:

| Variable | Value |
| --- | --- |
| `STORAGE_BACKEND` | `mongodb` |
| `MONGODB_URI` | Your Atlas connection URI |
| `MONGODB_DB` | `kuku_promo` |
| `LLM_PROVIDER` | `groq` |
| `GROQ_API_KEY` | Your Groq key |
| `LLM_MODEL` | `openai/gpt-oss-120b` |
| `LLM_CONCURRENCY` | `1` |
| `LLM_RETRIES` | `1` |
| `LLM_TIMEOUT_MS` | `45000` |
| `LLM_MAX_COMPLETION_TOKENS` | `2000` |
| `LLM_TOKENS_PER_MINUTE` | `7500` or your account's lower applicable limit |
| `LLM_DAILY_TOKEN_BUDGET` | `190000` or your own smaller budget |
| `CANDIDATES_PER_EPISODE` | `1` |
| `BASELINE_SAMPLE_SIZE` | `5` |

Do not prefix secrets with `VITE_`. Do not add a local `.env` file to Git.

Deploy. The workspace opens directly, with no password, login form or session configuration. Only `MONGODB_URI` is required for hosted storage; `APP_PASSWORD` and `SESSION_SECRET` are unused and may be removed from Vercel.

**Access:** everyone who can reach the deployment can read shared scripts/results, upload files, save reviews and start analysis against the configured Groq quota. Origin checks and the client header are request guards, not authentication. Use only material you intend to expose to visitors. Existing confidential local data is never included in the deployment.

## 4. Verify your deployment

1. Open the deployment URL. The workspace should load directly.
2. Upload a **synthetic test pack first**. The browser uploads up to 3 MB per request, keeping each request below Vercel's function payload limit. ZIPs still have the application's 15 MB compressed / 30 MB expanded limits.
3. Keep the page open during processing. The browser advances one episode per API request. Job state is persisted in Atlas; closing the page pauses advancement, and opening that dataset again resumes it. This is browser-driven resumable processing, not a permanently running background server.
4. Refresh and confirm the same dataset/results remain. A new Vercel instance must see the same records.
5. Download **Export > Download raw output (.zip)**. Hosted downloads stream from the API and include saved responses and metadata. Downloads make no Groq calls.
6. Run AI on authorized input only. The actual model ID is recorded; cached responses are reused. Shared database quota reservations and leases prevent multiple Vercel instances from independently spending the same local token budget.
7. Open the deployment in a private browser window: it should open without a password. Confirm foreign-origin requests remain blocked. This is a shared workspace; it does not isolate visitors' data.

Existing local results stay on your computer. To host them, upload the original authorized ZIP through the app and analyze it there. Do not bundle private results into the deployment. A local usage ledger is not automatically imported into Atlas; the hosted budget starts independently, while Groq's account-wide limits still apply. Avoid running local and hosted analyses concurrently against the same free quota.

## Troubleshooting

- **`tsc: command not found`:** deploy the latest `main`, whose install command explicitly includes build dependencies. Set Root Directory to the repository root, not `backend` or `frontend`. Remove a dashboard Install Command override that skips installation or uses `--omit=dev`; use `npm ci --include=dev`. Redeploy without the previous build cache. Vercel needs TypeScript and Vite during the build even when the runtime uses production mode.
- **Hosted setup is incomplete:** verify `MONGODB_URI`, then redeploy after environment changes.
- **MongoDB connection timeout:** confirm the database user, URI/password encoding, cluster availability and Atlas network access.
- **413 on upload:** use the hosted UI, which sends 3 MB chunks; do not post a 15 MB multipart request directly to the Vercel function.
- **Function timeout:** reopen the dataset to resume persisted work. Keep one AI candidate per episode, one retry and the 45-second provider timeout. Already cached responses can be reused; in-flight provider requests can still fail or consume tokens.
- **AI is paused:** inspect the local hosted budget and Groq account quota. This does not mean MongoDB or uploads failed.
- **Old deployment UI:** redeploy from the updated source/lockfile and hard-refresh the page.

References: [Vercel Express](https://vercel.com/docs/frameworks/backend/express), [Vercel limits](https://vercel.com/docs/functions/limitations), [Atlas with Vercel](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/), [MongoDB GridFS](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/).
