## Environment Setup

Create your local env file from the example:

```bash
cp .env.example .env.local
```

Core keys for the app to run:
- `ANTHROPIC_API_KEY`
- `CHAT_MODEL`
- `CHAT_REASONING_MODE`
- `CHAT_REASONING_BUDGET_TOKENS`
- `CHAT_COMPACTION_TRIGGER_TOKENS`
- `EXA_API_KEY`
- `SEMANTIC_SCHOLAR_API_KEY`
- `OPENALEX_EMAIL`
- `UNPAYWALL_EMAIL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SPACETIMEDB_URI`
- `NEXT_PUBLIC_SPACETIMEDB_DATABASE`

Optional planned integrations (not currently read by runtime code):
- Upstash Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Cloudflare R2: `CLOUDFLARE_R2_*`

Validate that `.env.example` stays in sync with runtime env usage:

```bash
npm run env:check
```

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Run quality checks:

```bash
npm run env:check
npm run lint
npm run build
```
