export type CapabilityErrorCode =
  | 'invalid_input'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

const STATUS: Record<CapabilityErrorCode, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

/**
 * One error shape for every surface. `message` is written so a model calling the tool can
 * correct itself (which field, what was wrong, what is allowed).
 */
export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode;
  readonly details?: unknown;
  constructor(code: CapabilityErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'CapabilityError';
    this.code = code;
    this.details = details;
  }
  get status(): number {
    return STATUS[this.code];
  }
  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
