import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  createInvoke,
  createResult,
  createProcessing,
  createError,
} from "../src/envelope.js";
import { verifyMessage, hashPayload } from "../src/crypto.js";
import { HMPErrorCode } from "../src/errors.js";
import { HMP_VERSION } from "../src/constants.js";

const boss = Keypair.generate();
const worker = Keypair.generate();

describe("createInvoke", () => {
  const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
    task: "Analyze SOL price",
    params: { token: "SOL" },
  });

  it("has correct message format", () => {
    expect(invoke.hmp).toBe(HMP_VERSION);
    expect(invoke.type).toBe("invoke");
    expect(invoke.id).toMatch(/^msg_/);
    expect(invoke.from.wallet).toBe(boss.publicKey.toBase58());
    expect(invoke.to.wallet).toBe(worker.publicKey.toBase58());
  });

  it("has correct payload content", () => {
    expect(invoke.payload.task).toBe("Analyze SOL price");
    expect(invoke.payload.params).toEqual({ token: "SOL" });
  });

  it("has matching payload_hash", () => {
    expect(invoke.payload_hash).toBe(hashPayload(invoke.payload));
  });

  it("has valid signature", () => {
    expect(verifyMessage(invoke)).toBe(true);
  });
});

describe("createResult", () => {
  const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
    task: "test",
  });

  const result = createResult(
    invoke,
    worker,
    { status: "completed", result: { price: 150 } },
    {
      input_hash: hashPayload(invoke.payload),
      output_hash: hashPayload({ price: 150 }),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    },
  );

  it("has same ID as invoke", () => {
    expect(result.id).toBe(invoke.id);
  });

  it("has correct direction: Worker → Boss", () => {
    expect(result.from.wallet).toBe(worker.publicKey.toBase58());
    expect(result.to.wallet).toBe(boss.publicKey.toBase58());
  });

  it("includes execution proof", () => {
    expect(result.payload.proof).toBeDefined();
    expect(result.payload.proof!.input_hash).toMatch(/^sha256:/);
  });

  it("has valid signature", () => {
    expect(verifyMessage(result)).toBe(true);
  });
});

describe("createProcessing", () => {
  const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
    task: "long task",
  });

  const processing = createProcessing(invoke, worker, {
    estimated_time: 30,
    poll_url: "https://worker.xyz/hmp/tasks/msg_001",
  });

  it("has processing status", () => {
    expect(processing.payload.status).toBe("processing");
    expect(processing.payload.poll_url).toBe("https://worker.xyz/hmp/tasks/msg_001");
    expect(processing.payload.estimated_time).toBe(30);
  });

  it("has valid signature", () => {
    expect(verifyMessage(processing)).toBe(true);
  });
});

describe("createError", () => {
  const invoke = createInvoke(boss, worker.publicKey.toBase58(), {
    task: "test",
  });

  const error = createError(
    invoke,
    worker,
    HMPErrorCode.UNSUPPORTED_TASK,
    "Unsupported task type",
  );

  it("has error type", () => {
    expect(error.type).toBe("error");
    expect(error.payload.code).toBe(HMPErrorCode.UNSUPPORTED_TASK);
    expect(error.payload.message).toBe("Unsupported task type");
  });

  it("has valid signature", () => {
    expect(verifyMessage(error)).toBe(true);
  });
});
