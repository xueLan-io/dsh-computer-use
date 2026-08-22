/**
 * Unified error model for the desktop-control plugin.
 *
 * Kept independent of any platform native layer so it can be unit-tested
 * without a real desktop environment and reused across Windows/macOS/Linux
 * providers.
 * @module
 */

/** Recovery hints attached to every error. */
export type ErrorRecovery = 'REQUIRES_REFRESH' | 'DENY' | 'RETRY' | 'NONE'

/** Action error codes shared across platforms. */
export type ActionErrorCode =
  | 'INVALID_OBSERVATION'
  | 'OBSOLETE_OBSERVATION'
  | 'OBSERVATION_WINDOW_MISMATCH'
  | 'OBSERVATION_SESSION_MISMATCH'
  | 'WINDOW_IDENTITY_CHANGED'
  | 'UIA_TREE_CHANGED'
  | 'PROTECTED_WINDOW'
  | 'WINDOW_NOT_FOUND'
  | 'COORDINATE_OUT_OF_BOUNDS'
  | 'INVALID_ELEMENT_INDEX'
  | 'NATIVE_PROVIDER_UNAVAILABLE'
  | 'UIA_OBSERVATION_REQUIRED'
  | 'UIA_PROVIDER_UNAVAILABLE'
  | 'ELEMENT_NOT_FOUND'
  | 'CLIPBOARD_FAILED'
  | 'NATIVE_ACTIVATE_FAILED'
  | 'NATIVE_CAPTURE_FAILED'
  | 'NATIVE_INPUT_FAILED'
  | 'NATIVE_LAUNCH_FAILED'
  | 'INVALID_CLICK'
  | 'INPUT_TOO_LARGE'
  | 'FORBIDDEN_KEY'
  | 'UNSUPPORTED_KEY'
  | 'UNSUPPORTED_MODIFIER'
  | 'INVALID_SCROLL'
  | 'UNSAFE_APP'

/**
 * Error thrown by computer-use actions. Messages are code-first English so
 * they survive translation and serialization; the `code` is the stable
 * machine-readable identifier.
 */
export class ComputerUseError extends Error {
  readonly code: string
  readonly recovery: ErrorRecovery
  constructor(code: string, message: string, recovery: ErrorRecovery = 'NONE') {
    super(message)
    this.name = 'ComputerUseError'
    this.code = code
    this.recovery = recovery
  }
  toJSON(): object {
    return { ok: false, code: this.code, recovery: this.recovery, message: this.message }
  }
}
