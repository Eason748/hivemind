import type { HMPClient } from "./client.js";
import type { ChatOptions, ChatContext, InvokeResult } from "./types.js";
import { HMPError, HMPErrorCode } from "./errors.js";
import { MAX_PAYMENT, MIN_PAYMENT } from "./constants.js";

/**
 * HMPChat — Multi-turn conversation
 *
 * Each turn is an independent HMP invoke. The SDK auto-manages context
 * concatenation and payment.
 *
 * @example
 * ```ts
 * const chat = client.chat("WorkerWallet...", {
 *   endpoint: "https://worker-agent.xyz",
 *   paymentPerTurn: 0.1,
 * });
 *
 * const r1 = await chat.send("Analyze recent SOL trends");
 * const r2 = await chat.send("Compare with ETH"); // auto-carries r1 context
 * ```
 */
export class HMPChat {
  private client: HMPClient;
  private workerWallet: string;
  private options: ChatOptions;
  private _history: ChatContext[] = [];
  private _turns = 0;
  private _totalSpent = 0;

  constructor(client: HMPClient, workerWallet: string, options: ChatOptions) {
    if (options.paymentPerTurn < MIN_PAYMENT || options.paymentPerTurn > MAX_PAYMENT) {
      throw new HMPError(
        HMPErrorCode.PAYMENT_INSUFFICIENT,
        `paymentPerTurn must be between ${MIN_PAYMENT} and ${MAX_PAYMENT} USDC`,
      );
    }
    this.client = client;
    this.workerWallet = workerWallet;
    this.options = options;
  }

  /**
   * Send one turn of conversation
   *
   * Automatically includes history context in payload + handles payment
   */
  async send(message: string): Promise<InvokeResult> {
    // Check turn limit
    if (this.options.maxTurns && this._turns >= this.options.maxTurns) {
      throw new HMPError(
        HMPErrorCode.EXECUTION_FAILED,
        `Max turns reached (${this.options.maxTurns})`,
      );
    }

    // Check spend cap
    if (
      this.options.maxSpend &&
      this._totalSpent + this.options.paymentPerTurn > this.options.maxSpend
    ) {
      throw new HMPError(
        HMPErrorCode.EXECUTION_FAILED,
        `Max spend would be exceeded (${this._totalSpent} + ${this.options.paymentPerTurn} > ${this.options.maxSpend})`,
      );
    }

    // Construct invoke with history context
    const result = await this.client.invoke(this.workerWallet, {
      endpoint: this.options.endpoint,
      task: message,
      params: this._history.length > 0 ? { context: this._history } : undefined,
      payment: this.options.paymentPerTurn,
    });

    // Update state
    this._history.push({ role: "user", content: message });
    this._history.push({
      role: "agent",
      content: typeof result.result === "string" ? result.result : JSON.stringify(result.result),
    });
    this._turns++;
    this._totalSpent += this.options.paymentPerTurn;

    return result;
  }

  /** Total amount spent (USDC) */
  get totalSpent(): number {
    return this._totalSpent;
  }

  /** Completed turn count */
  get turns(): number {
    return this._turns;
  }

  /** Full conversation history */
  get history(): readonly ChatContext[] {
    return this._history;
  }
}
