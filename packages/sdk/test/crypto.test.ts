import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  generateId,
  hashPayload,
  buildSignContent,
  sign,
  verify,
  verifyMessage,
} from "../src/crypto.js";

describe("generateId", () => {
  it("generates a unique ID with msg_ prefix", () => {
    const id = generateId();
    expect(id).toMatch(/^msg_[a-f0-9]{16}$/);
  });

  it("generates different IDs each time", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("hashPayload", () => {
  it("produces a sha256: prefixed hash", () => {
    const hash = hashPayload({ task: "test" });
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("same input produces same hash", () => {
    const a = hashPayload({ task: "test", params: { x: 1 } });
    const b = hashPayload({ task: "test", params: { x: 1 } });
    expect(a).toBe(b);
  });

  it("different input produces different hash", () => {
    const a = hashPayload({ task: "a" });
    const b = hashPayload({ task: "b" });
    expect(a).not.toBe(b);
  });
});

describe("sign / verify", () => {
  const keypair = Keypair.generate();
  const content = buildSignContent({
    hmp: "1.0",
    id: "msg_test123",
    timestamp: new Date().toISOString(),
    fromWallet: keypair.publicKey.toBase58(),
    toWallet: Keypair.generate().publicKey.toBase58(),
    type: "invoke",
    payload_hash: "sha256:abc123",
  });

  it("signature verifies successfully", () => {
    const signature = sign(content, keypair);
    const valid = verify(content, signature, keypair.publicKey.toBase58());
    expect(valid).toBe(true);
  });

  it("fails when content is tampered", () => {
    const signature = sign(content, keypair);
    const valid = verify(content + "tampered", signature, keypair.publicKey.toBase58());
    expect(valid).toBe(false);
  });

  it("fails with wrong public key", () => {
    const signature = sign(content, keypair);
    const wrongKey = Keypair.generate().publicKey.toBase58();
    const valid = verify(content, signature, wrongKey);
    expect(valid).toBe(false);
  });

  it("returns false for invalid signature string", () => {
    const valid = verify(content, "invalid-signature!!!", keypair.publicKey.toBase58());
    expect(valid).toBe(false);
  });
});

describe("verifyMessage", () => {
  it("verifies a complete HMP message signature", () => {
    const keypair = Keypair.generate();
    const toWallet = Keypair.generate().publicKey.toBase58();
    const hmp = "1.0";
    const id = generateId();
    const timestamp = new Date().toISOString();
    const payload_hash = hashPayload({ task: "test" });

    const signContent = buildSignContent({
      hmp,
      id,
      timestamp,
      fromWallet: keypair.publicKey.toBase58(),
      toWallet,
      type: "invoke",
      payload_hash,
    });
    const signature = sign(signContent, keypair);

    const message = {
      hmp,
      id,
      timestamp,
      from: { wallet: keypair.publicKey.toBase58(), signature },
      to: { wallet: toWallet },
      type: "invoke" as const,
      payload_hash,
    };

    expect(verifyMessage(message)).toBe(true);
  });
});
