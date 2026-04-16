import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { HMPHandler } from "../src/handler.js";
import { createInvoke } from "../src/envelope.js";
import { HMPErrorCode } from "../src/errors.js";

const boss = Keypair.generate();
const worker = Keypair.generate();
const handler = new HMPHandler({ wallet: worker });

describe("HMPHandler.verify", () => {
  it("accepts a valid invoke message", async () => {
    const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
      task: "test task",
      params: { x: 1 },
    });

    const verified = await handler.verify(invoke);
    expect(verified.payload.task).toBe("test task");
  });

  it("rejects non-invoke type", async () => {
    const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
      task: "test",
    });
    (invoke as any).type = "result";

    await expect(handler.verify(invoke)).rejects.toThrow("Expected invoke");
  });

  it("rejects invalid signature", async () => {
    const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
      task: "test",
    });
    invoke.from.signature = "InvalidSignature111111111111111111111111111111";

    await expect(handler.verify(invoke)).rejects.toMatchObject({
      code: HMPErrorCode.SIGNATURE_FAILED,
    });
  });

  it("rejects tampered payload", async () => {
    const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
      task: "original",
    });
    // Tamper payload without updating hash
    invoke.payload.task = "tampered";

    await expect(handler.verify(invoke)).rejects.toMatchObject({
      code: HMPErrorCode.HASH_MISMATCH,
    });
  });

  it("rejects expired timestamp", async () => {
    // Timestamp is part of sign content, so we need to sign with the expired timestamp
    // This way the signature is valid but the timestamp is expired
    const { createInvoke: _ci, ...rest } = await import("../src/envelope.js");
    const { generateId, hashPayload, buildSignContent, sign } = await import("../src/crypto.js");
    const { HMP_VERSION } = await import("../src/constants.js");

    const payload = { task: "test" };
    const id = generateId();
    const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const payload_hash = hashPayload(payload);
    const fromWallet = boss.publicKey.toBase58();
    const toWallet = worker.publicKey.toBase58();

    const signContent = buildSignContent({
      hmp: HMP_VERSION,
      id,
      timestamp: expiredTimestamp,
      fromWallet,
      toWallet,
      type: "invoke",
      payload_hash,
    });
    const signature = sign(signContent, boss);

    const invoke = {
      hmp: HMP_VERSION,
      id,
      timestamp: expiredTimestamp,
      from: { wallet: fromWallet, signature },
      to: { wallet: toWallet },
      type: "invoke" as const,
      payload,
      payload_hash,
    };

    await expect(handler.verify(invoke)).rejects.toMatchObject({
      code: HMPErrorCode.TIMESTAMP_EXPIRED,
    });
  });

  it("rejects duplicate message ID", async () => {
    const handler2 = new HMPHandler({ wallet: worker });

    const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
      task: "test",
    });

    // First verification passes
    await handler2.verify(invoke);

    // Second verification with same ID is rejected
    await expect(handler2.verify(invoke)).rejects.toMatchObject({
      code: HMPErrorCode.DUPLICATE_ID,
    });
  });
});

describe("HMPHandler.result", () => {
  it("constructs response with execution proof", async () => {
    const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
      task: "test",
    });

    const startedAt = new Date();
    // Simulate execution
    const completedAt = new Date();

    const result = handler.result(
      invoke,
      { status: "completed", result: { answer: 42 } },
      { startedAt, completedAt },
    );

    expect(result.type).toBe("result");
    expect(result.id).toBe(invoke.id);
    expect(result.payload.status).toBe("completed");
    expect(result.payload.result).toEqual({ answer: 42 });
    expect(result.payload.proof).toBeDefined();
    expect(result.payload.proof!.input_hash).toMatch(/^sha256:/);
    expect(result.payload.proof!.output_hash).toMatch(/^sha256:/);
  });
});

describe("HMPHandler.error", () => {
  it("constructs error response", () => {
    const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
      task: "unsupported",
    });

    const error = handler.error(
      invoke,
      HMPErrorCode.UNSUPPORTED_TASK,
      "Unsupported task type",
    );

    expect(error.type).toBe("error");
    expect(error.payload.code).toBe(2002);
    expect(error.payload.message).toBe("Unsupported task type");
  });
});
