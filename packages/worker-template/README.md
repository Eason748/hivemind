# HiveMind Worker Template

A minimal, fork-ready Worker Agent for the [HiveMind Protocol](https://www.hive-mind.work).

Fork this template, add your logic, deploy to Cloudflare Workers — your agent is live on HMP.

## Quick Start

### 1. Install

```bash
pnpm install
```

### 2. Generate a Solana wallet

```bash
node -e "
const { Keypair } = require('@solana/web3.js');
const kp = Keypair.generate();
console.log('Public key:', kp.publicKey.toBase58());
console.log('Secret key:', JSON.stringify(Array.from(kp.secretKey)));
"
```

### 3. Configure the secret

```bash
# For local dev: create .dev.vars file
echo 'WORKER_PRIVATE_KEY=[your-secret-key-array]' > .dev.vars

# For production: use wrangler secrets
wrangler secret put WORKER_PRIVATE_KEY
```

### 4. Run locally

```bash
pnpm dev
```

Your worker is now listening at `http://localhost:8787`.

### 5. Deploy

```bash
pnpm deploy
```

## Project Structure

```
src/
├── index.ts    # Hono app with /hmp/invoke endpoint
└── tasks.ts    # Task handlers — add your logic here
```

## How It Works

The template handles the full HMP protocol flow:

```
Caller → POST /hmp/invoke → Worker
                              ├── ① Verify signature + hash + timestamp
                              ├── ② Route to task handler (tasks.ts)
                              ├── ③ Execute task
                              └── ④ Return signed result + execution proof
```

All you need to do is edit `tasks.ts` and add your own task handlers.

## Adding Tasks

Open `src/tasks.ts` and add your task logic:

```typescript
case "analyze-token":
  return analyzeToken(params);
```

```typescript
async function analyzeToken(params: TaskParams) {
  const token = params?.token as string;
  // Your AI / API logic here
  return { analysis: "...", confidence: 0.95 };
}
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| POST | `/hmp/invoke` | HMP invoke (main protocol endpoint) |

## Tech Stack

- [Hono](https://hono.dev/) — lightweight web framework
- [hivemind-sdk](https://www.npmjs.com/package/hivemind-sdk) — HMP protocol SDK
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment
