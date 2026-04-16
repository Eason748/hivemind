import { Keypair } from "@solana/web3.js";
import { TIMESTAMP_WINDOW_MS } from "./constants.js";
import { verifyMessage, hashPayload } from "./crypto.js";
import { createResult, createProcessing, createError } from "./envelope.js";
import { HMPError, HMPErrorCode } from "./errors.js";
import type {
  HMPOptions,
  HMPInvokeMessage,
  HMPResultMessage,
  HMPErrorMessage,
  HMPProof,
  VerifyPaymentFn,
} from "./types.js";

/**
 * HMPHandler — Worker side
 *
 * Verifies HMP requests, constructs responses.
 *
 * @example
 * ```ts
 * const handler = new HMPHandler({ wallet: myKeypair });
 *
 * app.post("/hmp/invoke", async (req) => {
 *   const message = await handler.verify(req);
 *   const result = await doWork(message.payload.task);
 *   return handler.result(message, { status: "completed", result });
 * });
 * ```
 */
export class HMPHandler {
  private wallet: Keypair;
  private verifyPayment?: VerifyPaymentFn;
  private processedIds = new Set<string>();

  constructor(
    options: HMPOptions & {
      /** Optional x402 payment verification function (skips payment check if omitted) */
      verifyPayment?: VerifyPaymentFn;
    },
  ) {
    this.wallet = options.wallet;
    this.verifyPayment = options.verifyPayment;
  }

  /**
   * Verify an HMP request
   *
   * Verification order per protocol spec:
   * ① x402 payment verification
   * ② HMP signature verification
   * ③ payload_hash verification
   * ④ timestamp + id verification
   */
  async verify(
    body: unknown,
    options?: {
      /** Request headers (for x402 verification) */
      headers?: Headers | Record<string, string>;
      /** Worker minimum price (USDC) */
      minPayment?: number;
    },
  ): Promise<HMPInvokeMessage> {
    // Basic format check
    const message = body as HMPInvokeMessage;
    if (!message?.hmp || !message?.id || !message?.type || !message?.from?.wallet) {
      throw new HMPError(HMPErrorCode.INVALID_FORMAT);
    }

    if (message.type !== "invoke") {
      throw new HMPError(HMPErrorCode.INVALID_FORMAT, `Expected invoke, got ${message.type}`);
    }

    // ① x402 payment verification
    if (this.verifyPayment && options?.headers) {
      const payment = await this.verifyPayment(options.headers);
      if (!payment.valid) {
        throw new HMPError(HMPErrorCode.PAYMENT_VERIFICATION_FAILED);
      }
      if (options.minPayment && payment.amount !== undefined && payment.amount < options.minPayment) {
        throw new HMPError(
          HMPErrorCode.PAYMENT_INSUFFICIENT,
          `Payment ${payment.amount} below minimum ${options.minPayment}`,
        );
      }
    }

    // ② HMP signature verification
    if (!verifyMessage(message)) {
      throw new HMPError(HMPErrorCode.SIGNATURE_FAILED);
    }

    // ③ payload_hash verification
    const expectedHash = hashPayload(message.payload);
    if (message.payload_hash !== expectedHash) {
      throw new HMPError(HMPErrorCode.HASH_MISMATCH);
    }

    // ④ Timestamp verification
    const messageTime = new Date(message.timestamp).getTime();
    const now = Date.now();
    if (Math.abs(now - messageTime) > TIMESTAMP_WINDOW_MS) {
      throw new HMPError(HMPErrorCode.TIMESTAMP_EXPIRED);
    }

    // ④ ID dedup verification
    if (this.processedIds.has(message.id)) {
      throw new HMPError(HMPErrorCode.DUPLICATE_ID);
    }
    this.processedIds.add(message.id);

    // Periodically clean processed IDs (keep most recent 10000)
    if (this.processedIds.size > 10000) {
      const ids = Array.from(this.processedIds);
      this.processedIds = new Set(ids.slice(-5000));
    }

    return message;
  }

  /**
   * Construct a success response (with execution proof)
   *
   * @param invoke - Original invoke message
   * @param data - Business result
   * @param timing - Execution timing (for generating proof)
   */
  result(
    invoke: HMPInvokeMessage,
    data: { status: "completed"; result: unknown },
    timing?: { startedAt: Date; completedAt: Date },
  ): HMPResultMessage {
    const now = new Date();
    const proof: HMPProof = {
      input_hash: hashPayload(invoke.payload),
      output_hash: hashPayload(data.result),
      started_at: (timing?.startedAt ?? now).toISOString(),
      completed_at: (timing?.completedAt ?? now).toISOString(),
    };
    return createResult(invoke, this.wallet, data, proof);
  }

  /**
   * Construct a processing response (long-running tasks)
   */
  processing(
    invoke: HMPInvokeMessage,
    options: { estimated_time: number; poll_url: string },
  ): HMPResultMessage {
    return createProcessing(invoke, this.wallet, options);
  }

  /**
   * Construct an error response
   */
  error(
    invoke: HMPInvokeMessage,
    code: HMPErrorCode,
    message: string,
  ): HMPErrorMessage {
    return createError(invoke, this.wallet, code, message);
  }

  /** Get wallet address */
  get address(): string {
    return this.wallet.publicKey.toBase58();
  }
}
