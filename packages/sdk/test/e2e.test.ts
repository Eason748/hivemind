import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Keypair } from "@solana/web3.js";
import { HMPClient } from "../src/client.js";
import { HMPHandler } from "../src/handler.js";
import { HMPErrorCode } from "../src/errors.js";
import type { HMPInvokeMessage } from "../src/types.js";
import http from "node:http";

/**
 * End-to-end test: Boss (HMPClient) → Worker (HMPHandler)
 *
 * Uses a real HTTP server to simulate the full invoke flow:
 * 1. Boss constructs invoke + signs → sends HTTP request
 * 2. Worker verifies signature + hash → executes task → returns result + proof
 * 3. Boss verifies Worker signature + execution proof
 */
describe("Client → Handler end-to-end", () => {
  const bossKeypair = Keypair.generate();
  const workerKeypair = Keypair.generate();

  const handler = new HMPHandler({ wallet: workerKeypair });
  const client = new HMPClient({ wallet: bossKeypair });

  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    // Start mock Worker server
    server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/hmp/invoke") {
        let body = "";
        for await (const chunk of req) body += chunk;

        try {
          const startedAt = new Date();
          const message = await handler.verify(JSON.parse(body));
          const completedAt = new Date();

          // Simulate task execution
          const taskResult = {
            answer: `Completed: ${message.payload.task}`,
            params: message.payload.params,
          };

          const result = handler.result(
            message,
            { status: "completed", result: taskResult },
            { startedAt, completedAt },
          );

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          // Construct a simple error response
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            hmp: "1.0",
            type: "error",
            payload: { code: err.code ?? 1001, message: err.message },
          }));
        }
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it("full invoke flow: sign → send → verify → respond", async () => {
    const result = await client.invoke(workerKeypair.publicKey.toBase58(), {
      endpoint: `http://127.0.0.1:${port}`,
      task: "Current SOL price",
      params: { token: "SOL" },
      payment: 0.5,
    });

    // Verify result
    expect(result.result).toEqual({
      answer: "Completed: Current SOL price",
      params: { token: "SOL" },
    });

    // Verify execution proof
    expect(result.proof).toBeDefined();
    expect(result.proof.input_hash).toMatch(/^sha256:/);
    expect(result.proof.output_hash).toMatch(/^sha256:/);

    // Verify raw message
    expect(result.raw.type).toBe("result");
    expect(result.raw.from.wallet).toBe(workerKeypair.publicKey.toBase58());
  });

  it("throws on insufficient payment", async () => {
    await expect(
      client.invoke(workerKeypair.publicKey.toBase58(), {
        endpoint: `http://127.0.0.1:${port}`,
        task: "test",
        payment: 0.01, // below 0.1 minimum
      }),
    ).rejects.toMatchObject({ code: HMPErrorCode.PAYMENT_INSUFFICIENT });
  });

  it("throws on excessive payment", async () => {
    await expect(
      client.invoke(workerKeypair.publicKey.toBase58(), {
        endpoint: `http://127.0.0.1:${port}`,
        task: "test",
        payment: 10, // exceeds 5 USDC limit
      }),
    ).rejects.toMatchObject({ code: HMPErrorCode.PAYMENT_EXCEEDS_LIMIT });
  });

  it("generates different IDs for each invoke", async () => {
    const r1 = await client.invoke(workerKeypair.publicKey.toBase58(), {
      endpoint: `http://127.0.0.1:${port}`,
      task: "Task A",
      payment: 0.1,
    });
    const r2 = await client.invoke(workerKeypair.publicKey.toBase58(), {
      endpoint: `http://127.0.0.1:${port}`,
      task: "Task B",
      payment: 0.1,
    });

    expect(r1.raw.id).not.toBe(r2.raw.id);
  });
});
