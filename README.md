# Polypharmacy Explorer

Polypharmacy Explorer is a full-stack health-adjacent portfolio project for exploring potential drug interactions as an interactive graph.

The app combines local drug registry data, openFDA label data, MongoDB vector search, and AI-assisted normalization of interaction text. It is built as a developer demo and decision-support prototype, not as a medical device or source of medical advice.

## Problem

Patients often take several medications at once. Drug interaction data exists in public labels, but it is difficult to inspect quickly when comparing several drugs together.

This project turns that workflow into an interactive graph:

1. Search for a drug by name or active ingredient.
2. Add multiple drugs to the graph.
3. Fetch and cache pairwise interaction analysis.
4. Highlight drugs relevant to a symptom or risk phrase using vector search.
5. Open graph edges to inspect an AI-normalized summary grounded in FDA label text.

## Features

- Drug search through local MongoDB data and openFDA label enrichment.
- Interaction graph built with React Flow and Dagre layout.
- Canonical interaction pairs, so `A + B` and `B + A` share one cached record.
- AI normalization with strict Joi validation before storing model output.
- Symptom/risk semantic search over FDA label embeddings.
- Centralized API validation and normalized error responses.
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
MONGO_URI=mongodb://user:password@localhost:27017/?authSource=admin
DB_NAME=polypharmacy
OPENAI_API_KEY=sk-...
CORS_ORIGIN=http://localhost:5173
```

Create frontend env:

```bash
cp front/.env.example front/.env
```

Frontend variable:

```env
VITE_API_URL=http://localhost:3000
```

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

Highlight selected drugs by symptom or risk phrase:

```bash
curl -X POST http://localhost:3000/search/symptom \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"stomach bleeding risk\",\"drugIds\":[\"DRUG_ID_A\",\"DRUG_ID_B\"]}"
```

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

Latest local validation:

| Command | Result |
| --- | --- |
| `cd back && npm test` | Passed: 5 suites, 11 tests |
| `cd front && npm run build` | Passed, with a Vite chunk-size warning |
| `cd front && npm run lint` | Passed, with 2 React warnings in `GraphView.tsx` |

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
- **Interaction pairs are canonicalized.** The repository stores drug pairs in stable order to avoid duplicate `A+B` and `B+A` records.
- **Long FDA labels are bounded before embedding.** The service limits FDA text length to avoid OpenAI context-limit failures.
- **Express app and server bootstrap are separated.** `src/app.js` can be imported by tests without opening a network port.
- **openFDA enrichment is best-effort.** If openFDA has no matching labels, local search results can still be returned.

## Limitations

- This is not medical advice and must not be used for clinical decisions.
- Backend is JavaScript while frontend is TypeScript; backend TypeScript migration is a future improvement.
- Structured logging, request IDs, metrics, and retry/backoff are not fully implemented yet.
- Docker Compose and CI/CD are not included yet.
- Frontend UX is still prototype-level and needs stronger empty, loading, error, and removal states.
- MongoDB Atlas Vector Search index setup must be configured outside the repository.

## Roadmap

- Add Docker Compose for MongoDB, backend, and frontend.
- Add GitHub Actions for install, build, test, and Docker build.
- Add structured logging with request IDs and redaction.
- Add API versioning under `/api/v1`.
- Add frontend removal controls, better empty states, and long-running request feedback.
- Store FDA source snippets, model name, prompt version, confidence metadata, and timestamps for auditability.
- Add Redis caching or a background queue for high-latency FDA/OpenAI workflows.
