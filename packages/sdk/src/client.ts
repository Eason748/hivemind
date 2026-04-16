import { Keypair } from "@solana/web3.js";
import { MIN_PAYMENT, MAX_PAYMENT, DEFAULT_TIMEOUT_MS } from "./constants.js";
import { verifyMessage, hashPayload } from "./crypto.js";
import { createInvoke } from "./envelope.js";
import { HMPError, HMPErrorCode } from "./errors.js";
import { HMPChat } from "./chat.js";
import type {
  HMPOptions,
  InvokeOptions,
  InvokeResult,
  ChatOptions,
  HMPMessage,
  HMPResultMessage,
  HMPErrorMessage,
  CreatePaymentFn,
} from "./types.js";

/**
 * HMPClient — Caller side
 *
 * Constructs HMP invoke messages, sends to Worker, verifies responses.
 *
 * @example
 * ```ts
 * const client = new HMPClient({ wallet: myKeypair });
 * const result = await client.invoke("WorkerWallet...", {
 *   endpoint: "https://worker-agent.xyz",
 *   task: "Analyze SOL price",
 *   params: { token: "SOL" },
 *   payment: 0.1,
 * });
 * ```
 */
export class HMPClient {
  private wallet: Keypair;
  private createPayment?: CreatePaymentFn;

  constructor(
    options: HMPOptions & {
      /** Optional x402 payment creation function (skips payment headers if omitted) */
      createPayment?: CreatePaymentFn;
    },
  ) {
    this.wallet = options.wallet;
    this.createPayment = options.createPayment;
  }

  /**
   * Single HMP invoke
   *
   * Construct invoke → sign → x402 payment → send → verify response
   */
  async invoke(workerWallet: string, options: InvokeOptions): Promise<InvokeResult> {
    // ① Validate payment amount
    if (options.payment < MIN_PAYMENT) {
      throw new HMPError(
        HMPErrorCode.PAYMENT_INSUFFICIENT,
        `Payment ${options.payment} USDC below minimum ${MIN_PAYMENT}`,
      );
    }
    if (options.payment > MAX_PAYMENT) {
      throw new HMPError(
        HMPErrorCode.PAYMENT_EXCEEDS_LIMIT,
        `Payment ${options.payment} USDC exceeds maximum ${MAX_PAYMENT}`,
      );
    }

    // ② Construct HMP invoke message
    const message = createInvoke(this.wallet, workerWallet, {
      task: options.task,
      params: options.params,
    });

    // ③ Construct x402 payment headers
    const paymentHeaders: Record<string, string> = {};
    if (this.createPayment) {
      const x402 = await this.createPayment({
        amount: options.payment,
        recipient: workerWallet,
        payer: this.wallet,
      });
      Object.assign(paymentHeaders, x402);
    }

    // ④ Send request
    const url = `${options.endpoint.replace(/\/$/, "")}/hmp/invoke`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeout ?? DEFAULT_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...paymentHeaders,
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new HMPError(HMPErrorCode.EXECUTION_TIMEOUT, "Request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    // ⑤ Parse response
    const body = (await response.json()) as HMPMessage;

    // Payment errors
    if (response.status === 402) {
      const msg = body.type === "error" ? body.payload.message : "Payment required";
      throw new HMPError(HMPErrorCode.PAYMENT_REQUIRED, msg);
    }

    // HMP error response
    if (body.type === "error") {
      const errMsg = body as HMPErrorMessage;
      throw new HMPError(errMsg.payload.code, errMsg.payload.message);
    }

    // ⑥ Verify result response
    const result = body as HMPResultMessage;

    // Verify Worker signature
    if (!verifyMessage(result)) {
      throw new HMPError(HMPErrorCode.SIGNATURE_FAILED, "Worker response signature invalid");
    }

    // Verify payload_hash
    const expectedHash = hashPayload(result.payload);
    if (result.payload_hash !== expectedHash) {
      throw new HMPError(HMPErrorCode.HASH_MISMATCH, "Response payload hash mismatch");
    }

    // Verify id matches
    if (result.id !== message.id) {
      throw new HMPError(HMPErrorCode.INVALID_FORMAT, "Response ID does not match request");
    }

    // Processing status (long-running task)
    if (result.payload.status === "processing") {
      // TODO: support polling poll_url
      return {
        result: null,
        proof: result.payload.proof!,
        raw: result,
      };
    }

    // ⑦ Return result
    if (!result.payload.proof) {
      throw new HMPError(HMPErrorCode.INVALID_FORMAT, "Response missing execution proof");
    }

    return {
      result: result.payload.result,
      proof: result.payload.proof,
      raw: result,
    };
  }

  /**
   * Create a multi-turn chat instance
   */
  chat(workerWallet: string, options: ChatOptions): HMPChat {
    return new HMPChat(this, workerWallet, options);
  }

  /** Get wallet address */
  get address(): string {
    return this.wallet.publicKey.toBase58();
  }
}
