# Polypharmacy Explorer

Polypharmacy Explorer is a full-stack health-adjacent portfolio project for exploring potential drug interactions as an interactive graph.

The app combines local drug registry data, openFDA label data, MongoDB vector search, and AI-assisted normalization of interaction text. It is built as a developer demo and decision-support prototype, not as a medical device or source of medical advice.

## Problem

Patients often take several medications at once. Drug interaction data exists in public labels, but it is difficult to inspect quickly when comparing several drugs together.

This project turns that workflow into an interactive graph:

1. Search for a drug by name or active ingredient.
2. Add multiple drugs to the graph.
3. Fetch and cache pairwise interaction analysis.
4. Highlight drugs and saved interaction summaries relevant to a symptom or risk phrase.
5. Open graph edges to inspect an AI-normalized summary grounded in FDA label text.

## Features

- Drug search through local MongoDB data and openFDA label enrichment.
- Interaction graph built with React Flow and Dagre layout.
- Graph warning that missing edges mean unavailable/absent data, not proven safety.
- Normalized unique drug names to reduce duplicate records from casing and whitespace differences.
- Canonical interaction pairs, so `A + B` and `B + A` share one cached record.
- AI normalization with strict Joi validation before storing model output.
- Symptom/risk search over FDA label embeddings and saved AI-normalized interaction summaries.
- Centralized API validation and normalized error responses.
- FDA retry/backoff and graceful degradation for interaction checks when external APIs are rate-limited.
- Bounded concurrency and in-flight deduplication for expensive interaction analysis.
- Demo API key gate and in-memory rate limit for write/AI-cost endpoints.
- Backend tests for validation, error handling, canonical pair behavior, importable app setup, and long FDA label handling.

## Architecture

```mermaid
flowchart LR
    UI[React + TypeScript UI] --> API[Express API]
    API --> Mongo[(MongoDB / Atlas)]
    API --> FDA[openFDA Drug Label API]
    API --> OpenAI[OpenAI Embeddings + Chat]
    Mongo --> Graph[Cached Drugs + Interactions]
```

Backend structure:

- `routes` define API endpoints.
- `controllers` keep HTTP request/response handling thin.
- `services` contain FDA, AI, interaction, and drug workflows.
- `repository` isolates MongoDB queries and canonical pair persistence.
- `models` define Mongoose schemas and indexes.
- `middlewares` handle validation and normalized errors.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Redux Toolkit Query, React Flow, Tailwind CSS, Vite |
| Backend | Node.js, Express 5, Mongoose, Joi |
| Data | MongoDB, MongoDB Atlas Vector Search |
| AI / External APIs | OpenAI API, openFDA Drug Label API |
| Testing | Jest, Supertest |
| Packaging | Backend Dockerfile |

## Requirements

- Node.js 24+
- npm
- MongoDB connection
- OpenAI API key
- MongoDB Atlas Vector Search index for symptom/risk semantic search

Basic drug search and interaction caching use MongoDB collections. The `/search/symptom` endpoint uses MongoDB `$vectorSearch`, so a plain local MongoDB instance is not enough for that feature unless it supports the required vector search capability.

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
DEMO_API_KEY=change-me
```

Create frontend env:

```bash
cp front/.env.example front/.env
```

Frontend variable:

```env
VITE_API_URL=http://localhost:3000
VITE_DEMO_API_KEY=change-me
```

`OPENAI_API_KEY` is required at backend startup. `DEMO_API_KEY` is optional for local development, where the server prints a warning if it is missing; outside local runtime, for example `NODE_ENV=production`, startup fails without it.

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

## Database Migrations

Existing databases created before `normalizedName` was introduced must be backfilled before relying on the unique drug-name index.

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

Search and enrich drugs:

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"ibuprofen\"}"
```

Check interactions for selected drugs:

```bash
curl -X POST http://localhost:3000/interactions/check \
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

`failedPairs` is populated when one pair cannot be synced from FDA/OpenAI during a partial interaction check. The API still returns cached and successfully completed interactions, and the UI lists failed pair names with reasons.

Highlight selected drugs by symptom or risk phrase:

```bash
curl -X POST http://localhost:3000/search/symptom \
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

`drugs` comes from vector search over selected drug FDA label embeddings. `interactions` comes from saved pair summaries/actions, so symptom search can also highlight graph edges when the phrase matches an already analyzed interaction.

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

Current backend test coverage focuses on:

- request validation contract
- normalized error middleware
- canonical interaction pair storage
- Express app importability without starting the server
- fallback behavior when openFDA returns no drug labels
- long FDA label truncation before OpenAI embeddings
- OpenAI and FDA external error mapping
- bounded interaction sync concurrency
- in-flight deduplication for concurrent interaction pair syncs
- demo API key and rate-limit protection for costly endpoints
- normalized drug name duplicate protection

Latest local validation:

| Command | Result |
| --- | --- |
| `cd back && npm test` | Passed: 13 suites, 42 tests |
| `cd front && npm run build` | Passed, with a Vite chunk-size warning |
| `cd front && npm run lint` | Passed, with 2 React warnings in `GraphView.tsx` |

GitHub Actions runs backend tests and frontend build/lint on pushes to `main` and on pull requests.

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
- **Symptom search has two sources.** Drug matches use vector search over FDA label embeddings; interaction matches use saved AI-normalized pair descriptions and action guidance.
- **Drug names are normalized before persistence.** A `normalizedName` unique index prevents duplicates caused by casing or extra whitespace.
- **Interaction pairs are canonicalized.** The repository stores drug pairs in stable order to avoid duplicate `A+B` and `B+A` records.
- **Interaction analysis uses bounded concurrency.** Cold-cache pair analysis is parallelized with a small concurrency limit to reduce latency without overwhelming FDA/OpenAI.
- **Concurrent pair syncs are deduplicated in-process.** Parallel requests for the same canonical pair share one in-flight Promise, avoiding duplicate FDA/OpenAI spend in a single Node process.
- **Long FDA labels are bounded before embedding.** The service limits FDA text length to avoid OpenAI context-limit failures.
- **Express app and server bootstrap are separated.** `src/app.js` can be imported by tests without opening a network port.
- **openFDA calls use retry/backoff and best-effort degradation.** Rate-limited or unavailable FDA calls do not fail the entire interaction check; cached/successful interactions are still returned.
- **Expensive endpoints are gated for demos.** When `DEMO_API_KEY` is configured, write/AI-cost routes require `x-demo-api-key`; they also have an in-memory rate limit.
- **Runtime configuration fails fast.** The backend refuses to start without `OPENAI_API_KEY`; non-local runtimes also require `DEMO_API_KEY`.

## Limitations

- This is not medical advice and must not be used for clinical decisions.
- A missing graph edge means no interaction record was found or returned for that pair; it does not prove the combination is safe.
- Backend is JavaScript while frontend is TypeScript; backend TypeScript migration is a future improvement.
- Structured logging, request IDs, and metrics are not fully implemented yet.
- Docker Compose is not included yet.
- CI exists for backend tests and frontend build/lint, but deployment/CD and Docker image build checks are not configured yet.
- Frontend UX covers removal, loading, common API errors, and partial interaction failure details, but still needs richer empty states, per-pair progress, and more polished interaction details.
- MongoDB Atlas Vector Search index setup must be configured outside the repository.
- In-flight interaction deduplication is per Node process; multi-instance deployments need a distributed lock or persistent pending status.
- Existing MongoDB collections created before `normalizedName` still require the documented one-time backfill before deployment.

## Roadmap

- Add Docker Compose for MongoDB, backend, and frontend.
- Extend GitHub Actions with Docker build and deployment checks.
- Add structured logging with request IDs and redaction.
- Add API versioning under `/api/v1`.
- Improve frontend empty states, per-pair interaction progress, and result explainability.
- Store FDA source snippets, model name, prompt version, confidence metadata, and timestamps for auditability.
- Add Redis caching or a background queue for high-latency FDA/OpenAI workflows.
