# Polypharmacy Explorer

Polypharmacy Explorer is a full-stack health-adjacent portfolio project for exploring potential drug interactions as an interactive graph.

The app combines local drug registry data, openFDA and NIH DailyMed labels, exact PubChem chemical synonym resolution,
MongoDB vector search, and AI-assisted normalization of interaction text. It is built as a developer demo and
decision-support prototype, not as a medical device or source of medical advice.

## Problem

Patients often take several medications at once. Drug interaction data exists in public labels, but it is difficult to inspect quickly when comparing several drugs together.

This project turns that workflow into an interactive graph:

1. Search for a drug by name or active ingredient.
2. Add multiple drugs to the graph.
3. Fetch and cache pairwise interaction analysis.
4. Highlight drugs and saved interaction summaries relevant to a symptom or risk phrase.
5. Open graph edges to inspect an AI-normalized summary grounded in FDA label text.

## Features

- Drug search through local MongoDB data, then openFDA, NIH DailyMed, and exact PubChem chemical synonyms.
- Source-linked discovery with separate identity and verification URLs; no per-drug catalog is hardcoded.
- Interaction graph built with React Flow and Dagre layout.
- Graph warning that missing edges mean unavailable/absent data, not proven safety.
- PubChem-only drugs are marked on graph nodes, with a warning that chemical identity is not FDA label evidence.
- Normalized unique drug names to reduce duplicate records from casing and whitespace differences.
- Canonical interaction pairs, so `A + B` and `B + A` share one cached record.
- AI normalization with strict Joi validation before storing model output.
- Symptom/risk search over FDA label embeddings and saved AI-normalized interaction summaries.
- RAG answers over indexed FDA label passages, with source excerpts and links.
- Tool-calling agent that can inspect selected drugs, check interactions, and retrieve FDA evidence before answering.
- Centralized API validation and normalized error responses.
- FDA retry/backoff and graceful degradation for interaction checks when external APIs are rate-limited.
- Bounded concurrency and in-flight deduplication for expensive interaction analysis.
- Registration-code-gated accounts, email verification, password recovery, session revocation, CSRF protection, and per-user in-memory rate limits for costly endpoints.
- Backend tests for validation, error handling, canonical pair behavior, importable app setup, and long FDA label handling.

## Architecture

```mermaid
flowchart LR
    UI[React + TypeScript UI] --> API[Express API]
    API --> Mongo[(MongoDB / Atlas)]
    API --> FDA[openFDA Drug Label API]
    API --> DailyMed[NIH DailyMed]
    API --> PubChem[PubChem PUG]
    API --> OpenAI[OpenAI Embeddings + Chat]
    Mongo --> Graph[Cached Drugs + Interactions]
    FDA --> Passages[FDA Label Passages]
    Passages --> Mongo
    API --> RAG[RAG Retrieval + Answer]
    RAG --> Mongo
    RAG --> OpenAI
    API --> Agent[Tool-Calling Agent]
    Agent --> Mongo
    Agent --> FDA
    Agent --> OpenAI
```

Backend structure:

- `routes` define API endpoints.
- `controllers` keep HTTP request/response handling thin.
- `services` contain FDA, DailyMed, PubChem, AI, interaction, RAG, agent, and drug workflows.
- `repository` isolates MongoDB queries and canonical pair persistence.
- `models` define Mongoose schemas and indexes.
- `middlewares` handle validation and normalized errors.

The Vite SPA is designed for static hosting on S3 behind CloudFront, with Route 53 for DNS. The Express API owns authentication and session validation; AWS deployment is not implemented yet. For a separate API hostname, use a custom domain under the same site as the SPA so its `SameSite=Lax` session cookie works with credentialed browser requests. Configure that SPA origin in `CORS_ORIGIN`.

## Tech Stack

| Layer              | Technology                                                                |
|--------------------|---------------------------------------------------------------------------|
| Frontend           | React 19, TypeScript, Redux Toolkit Query, React Flow, Tailwind CSS, Vite |
| Backend            | Node.js, Express 5, Mongoose, Joi                                         |
| Data               | MongoDB, MongoDB Atlas Vector Search                                      |
| AI / External APIs | OpenAI API, openFDA Drug Label API, NIH DailyMed, PubChem PUG             |
| Testing            | Jest, Supertest, Node test runner, Vitest, Testing Library                |
| Packaging          | Backend Dockerfile                                                        |

## Requirements

- Node.js 24+
- npm
- MongoDB connection
- OpenAI API key
- MongoDB Atlas Vector Search indexes for drug labels, interactions, and FDA passage retrieval

Basic drug search and interaction caching use MongoDB collections. The `/search/symptom` endpoint uses MongoDB
`$vectorSearch`, so a plain local MongoDB instance is not enough for that feature unless it supports the required vector
search capability. Create an Atlas Vector Search index named `vector_index` on the `drugs` collection with this
definition (the 1536 dimensions match `text-embedding-3-small`):

```json
{
  "fields": [
    {"type": "vector", "path": "guidelines.embedding", "numDimensions": 1536, "similarity": "cosine"},
    {"type": "filter", "path": "_id"}
  ]
}
```

The `/rag/answer` endpoint also requires an Atlas Vector Search index on the `fdapassages` collection. Create it with the name `fda_passage_vector_index` and this definition (the 1536 dimensions match `text-embedding-3-small`):

```json
{
  "fields": [
    {"type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine"},
    {"type": "filter", "path": "drugId"}
  ]
}
```

Interaction-edge symptom search requires another Atlas Vector Search index named `interaction_vector_index` on the `interactions` collection:

```json
{
  "fields": [
    {"type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine"},
    {"type": "filter", "path": "drugA"},
    {"type": "filter", "path": "drugB"}
  ]
}
```

Newly analyzed interactions store an embedding of their summary, required action, and risk level. After creating the index, populate existing interactions with `cd back && npm run backfill:interaction-vectors -- --dry-run`, then `npm run backfill:interaction-vectors`. The backfill only embeds missing or changed text and can be rerun after interruption. Until the index is ready and old records are backfilled, interaction-edge symptom search cannot return those records.

For an online semantic regression check, set `INTERACTION_EVAL_DRUG_IDS` to at least three selected drug IDs whose saved edges include descriptions containing both “elevation of prothrombin time” and “prolongation of prothrombin time”, then run `cd back && npm run eval:interaction-search`. This calls OpenAI and Atlas, checks three related phrasings and one unrelated negative case, and may require adjusting the score threshold for your data. Unit tests check the query wiring but cannot prove model recall.

An uncached `/search` that processes openFDA labels indexes their passages. To populate passages for previously saved
drugs, search again after the query cache expires (or use a new matching query) before asking questions about them. A
cached search does not reindex passages. Label passages without an openFDA record ID are skipped because they cannot be
linked to a specific source record. Passage embeddings are reused when the source text and embedding model have not
changed.

Successful drug searches are cached in MongoDB for 24 hours; local-only results are cached for five minutes so openFDA can be retried. Repeating the same query returns the saved result set
without another openFDA, DailyMed, or PubChem request or passage reindexing. Empty fallback searches are cached for five
minutes, avoiding repeated waits during a temporary external outage. The UI also reuses its query cache during the
current session. After expiry, the next search refreshes external data and any changed passages.

When a name is missing from both the imported registry and openFDA, search continues to NIH DailyMed and then exact
PubChem chemical synonyms. After PubChem resolves an active ingredient, openFDA is checked by that ingredient; DailyMed
is checked by ingredient if no exact openFDA label is found. Verified label URLs are stored separately from the chemical
identity URL. A PubChem-only hit is marked as
chemical identity, not proof of a medicinal product or interaction; examples such as `tibolone`, `suprastin`, or
`Dimedrol` follow this general path rather than a hardcoded catalog. Those entries have no FDA label passages unless a
matching openFDA label is found later, so RAG and agent answers must report insufficient FDA evidence rather than
inventing an interaction.

## Environment

Create backend env:

```bash
cp back/.env.example back/.env
```

Required backend variables:

```env
PORT=3000
NODE_ENV=development
MONGO_URI=mongodb://user:password@localhost:27017/?authSource=admin
DB_NAME=polypharmacy
OPENAI_API_KEY=sk-...
CORS_ORIGIN=http://localhost:5173
# Optional local-development fallback only; production uses one-time invitations.
REGISTRATION_CODE=replace-with-a-local-development-code
APP_URL=http://localhost:5173
MAIL_MODE=console
```

Create frontend env:

```bash
cp front/.env.example front/.env
```

Frontend variable:

```env
VITE_API_URL=http://localhost:3000
```

`OPENAI_API_KEY` is required at backend startup. Create an email-bound, seven-day, one-time registration invitation with `cd back && npm run invite -- person@example.com`. Copy the generated code privately to that person; the registration form must use the same email. The raw code is printed once and only its SHA-256 hash is stored. A used or expired code cannot be reused. `REGISTRATION_CODE` remains an optional shared-code fallback for local development only and is ignored outside local runtime. Never place an invitation code in a `VITE_` variable. If registration fails after claiming an invitation, the API releases it for retry; after an interrupted process, an operator can issue a fresh invitation.

The API stores a hashed random session token in MongoDB and sends the raw token only in a seven-day, HttpOnly cookie (`Secure` in production). `/auth/me` returns the current user and a CSRF token; the SPA includes that token on authenticated POST requests. Login and registration are rate-limited by client IP; costly endpoints are rate-limited by signed-in user. These limits still use process memory and need shared storage before running multiple API instances.

New accounts must verify their email before using drug search or AI endpoints. Registration writes the user and a mail job in one MongoDB transaction, so MongoDB must support transactions (Atlas or a replica set). The outbox stores only the user ID and message purpose, not raw links or tokens. A worker generates each token immediately before delivery, atomically leases jobs, and retries failures up to five times with exponential backoff. Mail jobs remain available for inspection for seven days. Locally the API starts the worker and `MAIL_MODE=console` prints verification and password-reset links to the backend terminal shortly after a request. Set `MAIL_WORKER_AUTOSTART=false` to run `npm run mail:worker` separately and verify persisted jobs after an API restart without SMTP. In production run `cd back && npm run mail:worker` as a separate long-lived process. Set `MAIL_MODE=smtp`, `APP_URL` to the HTTPS SPA origin, and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, plus `SMTP_USER` and `SMTP_PASSWORD` when the server requires authentication. Production startup rejects console delivery. Accounts created before email verification was introduced retain access; new accounts have `emailVerifiedAt: null` until verified.

## Setup

Install backend dependencies:

```bash
cd back
npm install
```

Install frontend dependencies:

```bash
cd ../front
npm install
```

Start backend:

```bash
cd ../back
npm run dev
```

Start frontend:

```bash
cd ../front
npm run dev
```

Open the frontend at `http://localhost:5173`.

## Import Drug Registry

The backend includes a CLI import flow for registry CSV files:

```bash
cd back
npm run etl -- ./data/Product.csv
```

The CSV importer maps:

- `drugname` to `name`
- `activeingred` to `activeIngredient`

It skips repeated normalized names within each batch and duplicate-key rows already present in MongoDB, then reports rows read, imported, and skipped. Other write or validation errors stop the import.

## Database Migrations

Existing databases created before `normalizedName` was introduced must be backfilled before relying on the unique drug-name index.

Drug records without `guidelines.source` now have unknown provenance. Older CSV imports may already have `guidelines.source: "FDA"` stored by the previous schema default, and older administrator submissions were also labeled `FDA`. These changes do not rewrite existing records. Review them before clearing or changing that field, since genuine FDA-backed records must retain their source.

First run a dry run to detect duplicates:

```bash
cd back
npm run backfill:normalized-names -- --dry-run
```

If duplicate normalized names are reported, merge or remove those records manually before continuing. Then apply the backfill and create the unique index:

```bash
npm run backfill:normalized-names
```

## API Examples

Create an account using an invitation for this email and save the session cookie:

```bash
curl -c cookies.txt -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com","password":"a-long-unique-password","registrationCode":"YOUR_ONE_TIME_CODE"}'
```

The JSON response contains `csrfToken`. Send it as `x-csrf-token` with the saved cookie on subsequent POST requests. New users must follow the verification link before using protected drug endpoints. Existing users can POST `email` and `password` to `/auth/login`; GET `/auth/me` restores the CSRF token after a page reload, and POST `/auth/logout` invalidates the session. The SPA also supports password reset and listing or revoking active sessions. API endpoints are `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/verify`, `POST /auth/resend-verification`, `GET /auth/sessions`, and `DELETE /auth/sessions/:sessionId`. Reset links expire after 30 minutes, verification links after 24 hours, and using a reset link revokes all sessions.

New accounts receive the `user` role. To authorize an existing verified account to submit drug records through `POST /`, set its role to `admin` using a privileged MongoDB connection, for example `db.users.updateOne({email: "person@example.com"}, {$set: {role: "admin"}})`. This endpoint still requires the session cookie and CSRF token. New submissions through this endpoint are stored with `Manual` provenance; new openFDA lookup results are marked `FDA`.

Search and enrich drugs:

```bash
curl -X POST http://localhost:3000/search \
  -b cookies.txt -H "x-csrf-token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"ibuprofen\"}"
```

`/search` returns one result per normalized drug name and only the fields needed by the UI. If older database rows contain duplicates, the result with the strongest available label evidence is selected; full FDA label text stays on the server. This does not delete duplicate MongoDB records.
If processing one openFDA analogue fails while others succeed, `/search` returns the available results with `X-Search-Partial: true` and does not cache that incomplete result set. The UI warns that results may be incomplete and lets users retry. If no result can be returned, the request fails rather than presenting an empty search as complete.

Check interactions for selected drugs:

```bash
curl -X POST http://localhost:3000/interactions/check \
  -b cookies.txt -H "x-csrf-token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"drugIds\":[\"DRUG_ID_A\",\"DRUG_ID_B\"]}"
```

Response shape:

```json
{
  "interactions": [],
  "failedPairs": []
}
```

`failedPairs` is populated when one pair cannot be synced from openFDA, DailyMed, or OpenAI during a partial interaction
check. The API still returns cached and successfully completed interactions, and the UI lists failed pair names with
reasons.

Highlight selected drugs by symptom or risk phrase:

```bash
curl -X POST http://localhost:3000/search/symptom \
  -b cookies.txt -H "x-csrf-token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"stomach bleeding risk\",\"drugIds\":[\"DRUG_ID_A\",\"DRUG_ID_B\"]}"
```

Response shape:

```json
{
  "drugs": [],
  "interactions": []
}
```

`drugs` and `interactions` both come from vector search using one embedding of the symptom query. The former searches selected drug FDA labels; the latter searches saved interaction summaries/actions and only returns edges between selected drugs above the similarity threshold. This lets related wording match without a manually maintained synonym list.

Ask a question grounded in indexed FDA label passages for selected drugs:

```bash
curl -X POST http://localhost:3000/rag/answer \
  -b cookies.txt -H "x-csrf-token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What do the labels say about bleeding risk?","drugIds":["DRUG_ID_A","DRUG_ID_B"]}'
```

The response contains `answer`, `sources`, and `promptVersion`. Each source includes a citation number, drug name, FDA section, excerpt, label URL, and retrieval score. If no relevant passages are available, the API returns an explicit insufficient-evidence answer with an empty `sources` array. The answer is a summary of retrieved label excerpts, not a clinical interaction assessment.

The agent endpoint accepts the same payload for up to four selected drugs:

```bash
curl -X POST http://localhost:3000/agent/ask \
  -b cookies.txt -H "x-csrf-token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What interaction evidence is available?","drugIds":["DRUG_ID_A","DRUG_ID_B"]}'
```

The agent chooses among three server-side tools: selected drug lookup, pairwise interaction checking, and FDA passage retrieval. Its response adds `toolCalls` to the RAG answer format. Tool access is restricted to the selected drug IDs; the interaction check runs at most once and FDA retrieval at most twice per request. Answers without valid FDA passage citations return an insufficient-evidence response. Cached interaction summaries help the agent find evidence but are not treated as citations.

For progress updates, `POST /agent/ask/stream` accepts the same JSON body and the same session cookie and CSRF header. It applies the same validation and rate limit as `/agent/ask`. The response is `text/event-stream` with `agent.started`, `tool.started`, `tool.completed`, `retrieval.completed`, `generation.started`, `answer.delta`, `sources`, and `agent.completed` events. The last event includes the full `result` object with the same `answer`, `sources`, `toolCalls`, and `promptVersion` contract as the JSON endpoint. Failures after the stream opens use an `error` event with a safe code, message, and trace ID. Closing the stream cancels active OpenAI calls and stops work at the next cancellation check; interaction and database operations already in progress may finish before cancellation takes effect.

The agent validates the full answer against retrieved citation numbers before sending any `answer.delta` text. The browser sees live tool and retrieval progress, then receives the validated answer in chunks. This does not expose chain-of-thought or raw, unchecked model tokens. The frontend keeps the original “Ask agent” button and adds “Stream agent” and “Stop streaming”.

## LLMOps Foundation

AI requests emit an `ai_request_complete` JSON log with a `traceId` matching the `X-Request-Id` response header. It records the models used, prompt version, total latency, provider-reported input/output tokens, estimated USD cost, retrieval counts and scores, agent tool statuses and latencies, and result citation/validation flags. Streaming traces also include `timeToFirstEventMs` and `timeToFirstTokenMs`; the latter measures the first validated answer chunk, after full-answer citation checks. Questions, excerpts, answers, cookies, and API keys are not logged. `model` is a list because one request can use both an embedding model and a chat model. `citationCount` counts distinct returned sources; `validationPassed` records whether the citation gate accepted the result. For non-answer AI operations, answer-specific fields are `null`.

Cost uses provider-reported usage and the current configured model rates: `gpt-4o-mini` input $0.15, cached input $0.075, output $0.60 per million tokens, and `text-embedding-3-small` input $0.02 per million tokens ([chat model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini), [embedding pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small)). It is an estimate, not a billing record. If usage is missing or the model has no configured rate, token totals and cost are `null`. Review rates when changing models or prices.

Run the deterministic RAG and agent evaluations locally:

```bash
cd back
npm run eval:rag
npm run eval:agent
```

The cases in `back/evals/` feed fixed retrieved passages and model responses into the real RAG and agent control flow. They check citation acceptance, insufficient-evidence behavior, source links, and tool execution without calling OpenAI or MongoDB. CI runs both commands. They are regression checks for those rules; they do not measure live model answer quality. A later live evaluation can add reviewed real-label cases and compare actual provider responses.

Health check:

```bash
curl http://localhost:3000/health
```

## Testing

Run backend tests:

```bash
cd back
npm test
```

Run frontend utility and component tests:

```bash
cd front
npm test
```

Current backend test coverage focuses on:

- request validation contract
- normalized error middleware
- canonical interaction pair storage
- Express app importability without starting the server
- fallback behavior when openFDA returns no drug labels
- DailyMed identity and interaction fallbacks
- exact PubChem synonym resolution without a hardcoded catalog
- long FDA label truncation before OpenAI embeddings
- OpenAI and FDA external error mapping
- bounded interaction sync concurrency
- in-flight deduplication for concurrent interaction pair syncs
- registration-code-gated registration, email verification, password recovery, session revocation, CSRF protection, and
  rate limits for costly endpoints
- normalized drug name duplicate protection
- FDA-grounded RAG and tool-calling agent citation gates
- deterministic RAG and agent evaluation cases plus isolated AI trace metrics

Latest local validation:

| Command                              | Result                                 |
|--------------------------------------|----------------------------------------|
| `cd back && npm test -- --runInBand` | Passed: 35 suites, 159 tests           |
| `cd back && npm run eval:rag`       | Passed: 3 cases                        |
| `cd back && npm run eval:agent`     | Passed: 2 cases                        |
| `cd front && npm test`               | Passed: 15 tests                       |
| `cd front && npm run build`          | Passed, with a Vite chunk-size warning |
| `cd front && npm run lint`           | Passed                                 |

GitHub Actions runs backend tests/evaluations and frontend tests/build/lint on pushes to `main` and on pull requests.

## Docker

Build backend image:

```bash
cd back
docker build -t polypharmacy-backend .
```

Run backend container:

```bash
docker run --env-file .env -p 3000:3000 polypharmacy-backend
```

Docker Compose for MongoDB, backend, and frontend is planned but not yet included.

## Important Design Decisions

- **AI output is treated as untrusted input.** The backend validates normalized interaction data with Joi before it can be stored.
- **Interaction severity analysis is versioned.** New interaction records store the AI rubric version, and stale cached records are reanalyzed with pair-specific context while falling back to cached data if external services fail.
- **Drug search merges local and openFDA results.** Search includes local products matching the name or active
  ingredient and bounded, deduplicated openFDA label matches. If neither source has results, it checks NIH DailyMed and
  then exact PubChem chemical synonyms. After PubChem resolves an ingredient, openFDA is checked by ingredient and
  DailyMed is checked if no exact openFDA label is found. The identity and label URLs are stored separately. A
  PubChem-only result is marked as chemical identity, not proof of a medicinal product or interaction. Products sharing
  an ingredient are search matches, not recommendations for therapeutic substitution.
- **Interaction evidence keeps provenance.** Cached pairs are returned first; new pairs are checked in openFDA and then NIH DailyMed, and saved with the source name, URL, evidence text, and retrieval time. A pair is not stored unless the second ingredient is explicitly mentioned in an interaction section. Missing evidence is not evidence of safety.
- **Symptom search has two sources.** Drug matches use vector search over FDA label embeddings; interaction matches use saved AI-normalized pair descriptions and action guidance.
- **Drug names are normalized before persistence.** A `normalizedName` unique index prevents duplicates caused by casing or extra whitespace. Concurrent openFDA analogue searches use an upsert on that name so they reuse one record.
- **Interaction pairs are canonicalized.** The repository stores drug pairs in stable order to avoid duplicate `A+B` and `B+A` records.
- **Interaction analysis uses bounded concurrency.** Cold-cache pair analysis is parallelized with a small concurrency limit to reduce latency without overwhelming FDA/OpenAI.
- **Concurrent pair syncs are deduplicated in-process.** Parallel requests for the same canonical pair share one in-flight Promise, avoiding duplicate FDA/OpenAI spend in a single Node process.
- **Long FDA labels are bounded before embedding.** The service limits FDA text length to avoid OpenAI context-limit failures.
- **Express app and server bootstrap are separated.** `src/app.js` can be imported by tests without opening a network port.
- **openFDA calls use retry/backoff and best-effort degradation.** Rate-limited or unavailable FDA calls do not fail the entire interaction check; cached/successful interactions are still returned.
- **API sessions gate costly endpoints.** Signed-in users send an HttpOnly session cookie and CSRF header; rate limits are keyed by user. Login and registration have separate IP-based limits.
- **Runtime configuration fails fast.** The backend refuses to start without `OPENAI_API_KEY`; production requires SMTP delivery and an HTTPS SPA origin.

## Limitations

- This is not medical advice and must not be used for clinical decisions.
- A missing graph edge means no interaction record was found or returned for that pair; it does not prove the combination is safe.
- Backend is JavaScript while frontend is TypeScript; backend TypeScript migration is a future improvement.
- AWS deployment is not implemented in this repository; production email delivery requires external SMTP configuration.
- The optional local development code is shared until rotated. Invitation issuance is a CLI operation. Failed mail jobs require an operator to investigate; users can request a new verification or reset email.
- API requests have generated IDs and JSON completion/error logs without URLs, query strings, bodies, or headers. AI trace metrics are logged per request; persistent trace storage, dashboards, and alerts are not implemented yet.
- Docker Compose is not included yet.
- CI exists for backend and frontend tests plus frontend build/lint, but deployment/CD and Docker image build checks are
  not configured yet.
- Frontend UX covers removal, loading, common API errors, partial interaction failure details, and an in-page graph
  container. Search/add/remove component flows have regression tests; other empty states, per-pair progress, and
  interaction detail presentation still need work.
- MongoDB Atlas Vector Search index setup must be configured outside the repository.
- RAG only covers FDA labels indexed through an uncached drug search; older cached drugs need a fresh search after cache
  expiry or a new matching query. Passage indexing is capped per label, so long labels may have incomplete coverage.
- PubChem-only chemical identities and DailyMed-only entries do not create FDA passages, so RAG and agent answers
  correctly report insufficient FDA evidence for those drugs.
- In-flight interaction deduplication is per Node process; multi-instance deployments need a distributed lock or persistent pending status.
- Existing MongoDB collections created before `normalizedName` can still contain duplicate records. Search hides duplicates, but the documented one-time backfill and manual duplicate resolution remain necessary before creating the unique index.

## Roadmap

1. Harden account delivery with a deployment-ready domain and proxy configuration, plus mail-worker monitoring and alerting.
2. Expand the deterministic citation evaluations with reviewed real-label cases and live model runs. Distinguish FDA, DailyMed, and PubChem coverage across search, graph, and answers; then consider live token streaming with citation-safe buffering.
3. Improve reliability and observability with persistent traces, dashboards, and alerts. Move rate limiting and interaction deduplication to shared storage before running multiple API instances; consider a queue for long-running external calls.
4. Expand frontend regression tests beyond search/add/remove flows and polish empty states, per-pair progress, and
   interaction details.
5. Define AWS infrastructure as code for S3, CloudFront, Route 53, an API runtime, TLS, secrets, and monitoring. Extend GitHub Actions with Docker build, staging deployment, and post-deployment checks.
6. Add a local multi-service setup and consider backend TypeScript migration and `/api/v1` versioning after the API contract stabilizes.
