# HiveMind SDK

**TypeScript SDK for the HiveMind Protocol (HMP) — Communication is Transaction.**

Every HTTP request between AI Agents carries identity (Ed25519), task, and Solana USDC micropayment (x402) — fused into one atomic operation.

<p>
  <a href="https://www.npmjs.com/package/hivemind-sdk"><img src="https://img.shields.io/npm/v/hivemind-sdk?color=9945ff&label=npm" alt="npm" /></a>
  <img src="https://img.shields.io/badge/Solana-x402-blueviolet" alt="Solana x402" />
  <img src="https://img.shields.io/badge/Colosseum-Frontier%202026-orange" alt="Hackathon" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

**Website**: [www.hive-mind.work](https://www.hive-mind.work) · **Docs**: [Protocol Spec](https://www.hive-mind.work/docs/spec) · [SDK Guide](https://www.hive-mind.work/docs/sdk)

---

## Install

```bash
npm install hivemind-sdk
```

---

## Usage

### Invoke an Agent

```typescript
import { HMPClient } from "hivemind-sdk";

const client = new HMPClient({ wallet: myKeypair });

const result = await client.invoke("WorkerWalletAddress...", {
  endpoint: "https://worker-agent.xyz",
  task: "Analyze SOL/USDC liquidity in the past 24h",
  params: { pair: "SOL/USDC", period: "24h" },
  payment: 0.5, // USDC
});

console.log(result.result);  // Worker's response
console.log(result.proof);   // Execution proof
```

The SDK handles everything: construct HMP message → Ed25519 sign → attach x402 payment → send → verify response signature → verify execution proof.

### Build a Worker Agent

```typescript
import { HMPHandler } from "hivemind-sdk";

const handler = new HMPHandler({ wallet: workerKeypair });

app.post("/hmp/invoke", async (req) => {
  // Verify: x402 payment + signature + payload hash + timestamp + dedup
  const message = await handler.verify(req.body);

  // Execute
  const startedAt = new Date();
  const data = await analyzeMarket(message.payload.task, message.payload.params);
  const completedAt = new Date();

  // Return signed result with execution proof
  return handler.result(
    message,
    { status: "completed", result: data },
    { startedAt, completedAt },
  );
});
```

Any agent can join HMP by implementing one endpoint: `POST /hmp/invoke`.

> **Prefer a ready-made template?** See [`packages/worker-template`](packages/worker-template) — fork it, edit `tasks.ts`, deploy to Cloudflare Workers.

### Multi-Turn Chat

Each turn is an independent invoke. The SDK auto-manages context and payment:

```typescript
const chat = client.chat("WorkerWallet...", {
  endpoint: "https://worker-agent.xyz",
  paymentPerTurn: 0.1,
  maxSpend: 1.0,       // total cap
});

const r1 = await chat.send("Analyze SOL trends");     // pay 0.1 USDC
const r2 = await chat.send("Compare with ETH");        // auto-carries r1 context
const r3 = await chat.send("Give me a conclusion");    // auto-carries r1 + r2

chat.totalSpent; // 0.3 USDC
chat.turns;      // 3
```

---

## Protocol Overview

HMP consists of three inseparable layers in every HTTP request:

```
┌─────────────────────────────────────────────┐
│  Identity Layer     Ed25519 dual signature  │  → Who's talking
├─────────────────────────────────────────────┤
│  Semantics Layer    HMP envelope + proof    │  → What was said & done
├─────────────────────────────────────────────┤
│  Payment Layer      x402 Solana USDC        │  → How much was paid
└─────────────────────────────────────────────┘
```

### Message Flow

```
Caller                                          Worker Agent
 │                                                │
 │  POST /hmp/invoke                              │
 │  Headers: x402 payment (0.5 USDC)              │
 │  Body: HMP invoke (signed)                     │
 │  ─────────────────────────────────────────→   │
 │                                                │
 │                          ① Verify payment ✓    │
 │                          ② Verify signature ✓  │
 │                          ③ Verify integrity ✓  │
 │                          ④ Execute task        │
 │                                                │
 │  ←──────── HTTP 200 + HMP result (signed)     │
 │                                                │
 │  Trusted result + execution proof + tx receipt │
```

### Micropayment as Trust

- **0.1 – 5 USDC** per invoke — protocol-enforced bounds
- Big task → split into N invokes → max loss per invoke is $5
- Agent cheats → loses all future income → cheating cost > gain
- No reputation system needed — economics enforce honesty

### Execution Proof

Every result is a dual-signed receipt — undeniable by either party:

```json
{
  "proof": {
    "input_hash": "sha256:abc123...",
    "output_hash": "sha256:def456...",
    "started_at": "2026-04-16T10:05:00.100Z",
    "completed_at": "2026-04-16T10:05:01.800Z"
  }
}
```

---

## API Reference

### HMPClient (Caller)

```typescript
const client = new HMPClient({
  wallet: Keypair,              // Solana wallet
  createPayment?: Function,     // Optional x402 payment creator
});

client.invoke(walletAddress, options) → Promise<InvokeResult>
client.chat(walletAddress, options)   → HMPChat
```

### HMPHandler (Worker)

```typescript
const handler = new HMPHandler({
  wallet: Keypair,              // Solana wallet
  verifyPayment?: Function,     // Optional x402 payment verifier
});

handler.verify(body, options?)                → Promise<HMPInvokeMessage>
handler.result(invoke, data, timing?)         → HMPResultMessage
handler.processing(invoke, { poll_url, ... }) → HMPResultMessage
handler.error(invoke, code, message)          → HMPErrorMessage
```

### HMPChat

```typescript
const chat = client.chat(wallet, {
  endpoint: string,
  paymentPerTurn: number,       // 0.1 – 5 USDC
  maxTurns?: number,
  maxSpend?: number,
});

chat.send(message)  → Promise<InvokeResult>
chat.totalSpent     → number
chat.turns          → number
chat.history        → ChatContext[]
```

### Error Codes

| Code | Category | Example |
|------|----------|---------|
| 1xxx | Protocol | 1002 Signature failed, 1005 Hash mismatch |
| 2xxx | Execution | 2002 Unsupported task, 2003 Execution failed |
| 3xxx | Payment | 3001 Payment required, 3002 Insufficient |

```typescript
import { HMPError, HMPErrorCode } from "hivemind-sdk";

try {
  await client.invoke(agent, options);
} catch (err) {
  if (err instanceof HMPError) {
    console.log(err.code);    // 3002
    console.log(err.message); // "Payment insufficient"
  }
}
```

---

## Comparison

| Project | Positioning | HMP Difference |
|---------|-------------|----------------|
| AutoGen / CrewAI | Agent orchestration | HMP defines communication standard, not orchestration |
| Bittensor | Decentralized AI inference | HMP is communication + payment, not inference |
| Fetch.ai | Agent marketplace (EVM) | Solana-native, communication is transaction |
| x402 | HTTP payment spec | HMP adds identity + semantics on top |
| A2A (Google) | Agent protocol | HMP natively integrates on-chain micropayment |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Protocol | HMP v1.0 (message envelope + Ed25519 + execution proof) |
| Payment | [x402](https://www.x402.org/) + Solana USDC + [Coinbase CDP](https://docs.cdp.coinbase.com/) |
| Signing | Ed25519 via [tweetnacl](https://github.com/nicedeveloper/tweetnacl-js), [bs58](https://github.com/nicedeveloper/bs58check) |
| Build | [tsup](https://tsup.egoist.dev/) (ESM + CJS + .d.ts) |
| Test | [Vitest](https://vitest.dev/) (34 tests) |

---

## Repository Structure

```
packages/
├── sdk/                  # hivemind-sdk (published to npm)
│   ├── src/              #   HMPClient, HMPHandler, Chat, crypto, types
│   └── test/             #   34 tests (crypto, envelope, handler, e2e)
└── worker-template/      # Fork-ready Worker Agent template
    └── src/
        ├── index.ts      #   Hono app with /hmp/invoke endpoint
        └── tasks.ts      #   Task handlers — add your logic here
```

## Development

```bash
# Install
pnpm install

# Build & test SDK
pnpm --filter hivemind-sdk build
pnpm --filter hivemind-sdk test

# Run Worker Template locally
cd packages/worker-template
echo 'WORKER_PRIVATE_KEY=[your-keypair-json-array]' > .dev.vars
pnpm dev
```

---

## Hackathon

Built for **[Colosseum Frontier Hackathon 2026](https://www.colosseum.org/)** — Solana ecosystem, April 6 – May 11, 2026.

## License

MIT
