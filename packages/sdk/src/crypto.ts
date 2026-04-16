import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash, randomUUID } from "node:crypto";
import type { HMPEnvelopeBase } from "./types.js";

/**
 * Generate a message ID
 * Format: msg_ + 16 random hex chars
 */
export function generateId(): string {
  return `msg_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Compute SHA-256 hash of payload
 * Returns format: sha256:<hex>
 */
export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  const hash = createHash("sha256").update(json).digest("hex");
  return `sha256:${hash}`;
}

/**
 * Build sign content string
 *
 * sign_content = hmp | id | timestamp | from.wallet | to.wallet | type | payload_hash
 * Separated by "|" to prevent field concatenation ambiguity
 */
export function buildSignContent(fields: {
  hmp: string;
  id: string;
  timestamp: string;
  fromWallet: string;
  toWallet: string;
  type: string;
  payload_hash: string;
}): string {
  return [
    fields.hmp,
    fields.id,
    fields.timestamp,
    fields.fromWallet,
    fields.toWallet,
    fields.type,
    fields.payload_hash,
  ].join("|");
}

/**
 * Ed25519 sign
 * Returns base58-encoded signature
 */
export function sign(content: string, keypair: Keypair): string {
  const messageBytes = new TextEncoder().encode(content);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  return bs58.encode(signatureBytes);
}

/**
 * Ed25519 verify
 */
export function verify(
  content: string,
  signatureBase58: string,
  walletAddress: string,
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(content);
    const signatureBytes = bs58.decode(signatureBase58);
    const publicKey = new PublicKey(walletAddress);
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes(),
    );
  } catch {
    return false;
  }
}

/**
 * Extract sign content from an HMP message and verify its signature
 */
export function verifyMessage(message: HMPEnvelopeBase): boolean {
  const content = buildSignContent({
    hmp: message.hmp,
    id: message.id,
    timestamp: message.timestamp,
    fromWallet: message.from.wallet,
    toWallet: message.to.wallet,
    type: message.type,
    payload_hash: message.payload_hash,
  });
  return verify(content, message.from.signature, message.from.wallet);
}
