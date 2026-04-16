import type { Keypair } from "@solana/web3.js";
import type { HMPErrorCode } from "./errors.js";

// ─── Message Envelope ───

/** Message type */
export type HMPMessageType = "invoke" | "result" | "error";

/** Sender info */
export interface HMPFrom {
  wallet: string;
  signature: string;
}

/** Recipient info */
export interface HMPTo {
  wallet: string;
}

/** Base message envelope */
export interface HMPEnvelopeBase {
  hmp: string;
  id: string;
  timestamp: string;
  from: HMPFrom;
  to: HMPTo;
  type: HMPMessageType;
  payload_hash: string;
}

// ─── invoke ───

/** Invoke payload */
export interface HMPInvokePayload {
  task: string;
  params?: Record<string, unknown>;
  context?: ChatContext[];
}

/** Invoke message */
export interface HMPInvokeMessage extends HMPEnvelopeBase {
  type: "invoke";
  payload: HMPInvokePayload;
}

// ─── result ───

/** Execution proof */
export interface HMPProof {
  input_hash: string;
  output_hash: string;
  started_at: string;
  completed_at: string;
}

/** Result payload status */
export type HMPResultStatus = "completed" | "processing";

/** Result payload */
export interface HMPResultPayload {
  status: HMPResultStatus;
  result?: unknown;
  proof?: HMPProof;
  /** Long task polling */
  estimated_time?: number;
  poll_url?: string;
}

/** Result message */
export interface HMPResultMessage extends HMPEnvelopeBase {
  type: "result";
  payload: HMPResultPayload;
}

// ─── error ───

/** Error payload */
export interface HMPErrorPayload {
  code: HMPErrorCode;
  message: string;
}

/** Error message */
export interface HMPErrorMessage extends HMPEnvelopeBase {
  type: "error";
  payload: HMPErrorPayload;
}

/** Union of all message types */
export type HMPMessage = HMPInvokeMessage | HMPResultMessage | HMPErrorMessage;

// ─── SDK Options ───

/** Client / Handler constructor options */
export interface HMPOptions {
  wallet: Keypair;
}

/** Invoke call options */
export interface InvokeOptions {
  endpoint: string;
  task: string;
  params?: Record<string, unknown>;
  payment: number;
  /** Request timeout (ms) */
  timeout?: number;
}

/** Invoke return result */
export interface InvokeResult {
  /** Worker response data */
  result: unknown;
  /** Execution proof */
  proof: HMPProof;
  /** Raw HMP result message */
  raw: HMPResultMessage;
}

/** Chat creation options */
export interface ChatOptions {
  endpoint: string;
  paymentPerTurn: number;
  maxTurns?: number;
  maxSpend?: number;
}

/** Chat context entry */
export interface ChatContext {
  role: "user" | "agent";
  content: string;
}

// ─── x402 Payment ───

/** x402 payment headers */
export interface X402Headers {
  "X-PAYMENT": string;
  "X-PAYMENT-TOKEN": string;
  "X-PAYMENT-NETWORK": string;
}

/** x402 payment creation function signature */
export type CreatePaymentFn = (options: {
  amount: number;
  recipient: string;
  payer: Keypair;
}) => Promise<X402Headers>;

/** x402 payment verification function signature */
export type VerifyPaymentFn = (headers: Headers | Record<string, string>) => Promise<{
  valid: boolean;
  amount?: number;
  payer?: string;
}>;
