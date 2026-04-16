import { Keypair } from "@solana/web3.js";
import { HMP_VERSION } from "./constants.js";
import { generateId, hashPayload, buildSignContent, sign } from "./crypto.js";
import type { HMPErrorCode } from "./errors.js";
import type {
  HMPInvokeMessage,
  HMPInvokePayload,
  HMPResultMessage,
  HMPResultPayload,
  HMPErrorMessage,
  HMPProof,
} from "./types.js";

/**
 * Construct an invoke message
 */
export function createInvoke(
  fromKeypair: Keypair,
  toWallet: string,
  payload: HMPInvokePayload,
): HMPInvokeMessage {
  const id = generateId();
  const timestamp = new Date().toISOString();
  const payload_hash = hashPayload(payload);
  const fromWallet = fromKeypair.publicKey.toBase58();

  const signContent = buildSignContent({
    hmp: HMP_VERSION,
    id,
    timestamp,
    fromWallet,
    toWallet,
    type: "invoke",
    payload_hash,
  });
  const signature = sign(signContent, fromKeypair);

  return {
    hmp: HMP_VERSION,
    id,
    timestamp,
    from: { wallet: fromWallet, signature },
    to: { wallet: toWallet },
    type: "invoke",
    payload,
    payload_hash,
  };
}

/**
 * Construct a result message
 *
 * @param invoke - Original invoke message (for correlating id and addresses)
 * @param workerKeypair - Worker wallet
 * @param data - Business result
 * @param proof - Execution proof
 */
export function createResult(
  invoke: HMPInvokeMessage,
  workerKeypair: Keypair,
  data: { status: "completed"; result: unknown },
  proof: HMPProof,
): HMPResultMessage {
  const timestamp = new Date().toISOString();
  const payload: HMPResultPayload = {
    status: data.status,
    result: data.result,
    proof,
  };
  const payload_hash = hashPayload(payload);
  const fromWallet = workerKeypair.publicKey.toBase58();

  const signContent = buildSignContent({
    hmp: HMP_VERSION,
    id: invoke.id,
    timestamp,
    fromWallet,
    toWallet: invoke.from.wallet,
    type: "result",
    payload_hash,
  });
  const signature = sign(signContent, workerKeypair);

  return {
    hmp: HMP_VERSION,
    id: invoke.id,
    timestamp,
    from: { wallet: fromWallet, signature },
    to: { wallet: invoke.from.wallet },
    type: "result",
    payload,
    payload_hash,
  };
}

/**
 * Construct a processing response (long-running tasks)
 */
export function createProcessing(
  invoke: HMPInvokeMessage,
  workerKeypair: Keypair,
  options: { estimated_time: number; poll_url: string },
): HMPResultMessage {
  const timestamp = new Date().toISOString();
  const payload: HMPResultPayload = {
    status: "processing",
    estimated_time: options.estimated_time,
    poll_url: options.poll_url,
  };
  const payload_hash = hashPayload(payload);
  const fromWallet = workerKeypair.publicKey.toBase58();

  const signContent = buildSignContent({
    hmp: HMP_VERSION,
    id: invoke.id,
    timestamp,
    fromWallet,
    toWallet: invoke.from.wallet,
    type: "result",
    payload_hash,
  });
  const signature = sign(signContent, workerKeypair);

  return {
    hmp: HMP_VERSION,
    id: invoke.id,
    timestamp,
    from: { wallet: fromWallet, signature },
    to: { wallet: invoke.from.wallet },
    type: "result",
    payload,
    payload_hash,
  };
}

/**
 * Construct an error message
 */
export function createError(
  invoke: HMPInvokeMessage,
  workerKeypair: Keypair,
  code: HMPErrorCode,
  message: string,
): HMPErrorMessage {
  const timestamp = new Date().toISOString();
  const payload = { code, message };
  const payload_hash = hashPayload(payload);
  const fromWallet = workerKeypair.publicKey.toBase58();

  const signContent = buildSignContent({
    hmp: HMP_VERSION,
    id: invoke.id,
    timestamp,
    fromWallet,
    toWallet: invoke.from.wallet,
    type: "error",
    payload_hash,
  });
  const signature = sign(signContent, workerKeypair);

  return {
    hmp: HMP_VERSION,
    id: invoke.id,
    timestamp,
    from: { wallet: fromWallet, signature },
    to: { wallet: invoke.from.wallet },
    type: "error",
    payload,
    payload_hash,
  };
}
