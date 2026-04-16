/**
 * HMP error codes
 *
 * 1xxx = Protocol errors
 * 2xxx = Execution errors
 * 3xxx = Payment errors
 */
export enum HMPErrorCode {
  // Protocol errors
  INVALID_FORMAT = 1001,
  SIGNATURE_FAILED = 1002,
  TIMESTAMP_EXPIRED = 1003,
  VERSION_MISMATCH = 1004,
  HASH_MISMATCH = 1005,
  DUPLICATE_ID = 1006,

  // Execution errors
  BUSY = 2001,
  UNSUPPORTED_TASK = 2002,
  EXECUTION_FAILED = 2003,
  EXECUTION_TIMEOUT = 2004,

  // Payment errors
  PAYMENT_REQUIRED = 3001,
  PAYMENT_INSUFFICIENT = 3002,
  PAYMENT_VERIFICATION_FAILED = 3003,
  PAYMENT_EXCEEDS_LIMIT = 3005,
}

/** Default messages for each error code */
const ERROR_MESSAGES: Record<HMPErrorCode, string> = {
  [HMPErrorCode.INVALID_FORMAT]: "Invalid message format",
  [HMPErrorCode.SIGNATURE_FAILED]: "Signature verification failed",
  [HMPErrorCode.TIMESTAMP_EXPIRED]: "Timestamp expired",
  [HMPErrorCode.VERSION_MISMATCH]: "Protocol version mismatch",
  [HMPErrorCode.HASH_MISMATCH]: "Payload hash mismatch",
  [HMPErrorCode.DUPLICATE_ID]: "Duplicate message ID",
  [HMPErrorCode.BUSY]: "Worker busy",
  [HMPErrorCode.UNSUPPORTED_TASK]: "Unsupported task type",
  [HMPErrorCode.EXECUTION_FAILED]: "Execution failed",
  [HMPErrorCode.EXECUTION_TIMEOUT]: "Execution timeout",
  [HMPErrorCode.PAYMENT_REQUIRED]: "Payment required",
  [HMPErrorCode.PAYMENT_INSUFFICIENT]: "Payment insufficient",
  [HMPErrorCode.PAYMENT_VERIFICATION_FAILED]: "Payment verification failed",
  [HMPErrorCode.PAYMENT_EXCEEDS_LIMIT]: "Payment exceeds protocol limit",
};

/** HMP protocol error */
export class HMPError extends Error {
  readonly code: HMPErrorCode;

  constructor(code: HMPErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? `HMP error ${code}`);
    this.name = "HMPError";
    this.code = code;
  }
}
