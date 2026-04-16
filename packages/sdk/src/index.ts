// Core classes
export { HMPClient } from "./client.js";
export { HMPHandler } from "./handler.js";
export { HMPChat } from "./chat.js";

// Errors
export { HMPError, HMPErrorCode } from "./errors.js";

// Constants
export {
  HMP_VERSION,
  MIN_PAYMENT,
  MAX_PAYMENT,
  TIMESTAMP_WINDOW_MS,
  DEFAULT_TIMEOUT_MS,
  SOLANA_NETWORK,
  PAYMENT_TOKEN,
} from "./constants.js";

// Low-level utilities (for advanced users)
export {
  generateId,
  hashPayload,
  buildSignContent,
  sign,
  verify,
  verifyMessage,
} from "./crypto.js";

export {
  createInvoke,
  createResult,
  createProcessing,
  createError,
} from "./envelope.js";

// Types
export type {
  HMPMessageType,
  HMPFrom,
  HMPTo,
  HMPEnvelopeBase,
  HMPInvokePayload,
  HMPInvokeMessage,
  HMPProof,
  HMPResultStatus,
  HMPResultPayload,
  HMPResultMessage,
  HMPErrorPayload,
  HMPErrorMessage,
  HMPMessage,
  HMPOptions,
  InvokeOptions,
  InvokeResult,
  ChatOptions,
  ChatContext,
  X402Headers,
  CreatePaymentFn,
  VerifyPaymentFn,
} from "./types.js";
