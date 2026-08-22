/**
 * Cross-platform capability model.
 *
 * Each provider advertises what it can actually do instead of letting the
 * core guess. Capability values may be booleans or a constraint string:
 *   - `false`            -> the capability is unavailable (`CAPABILITY_UNAVAILABLE`).
 *   - `'user-selected'`  -> requires explicit user selection/authorization.
 *   - `'portal'`         -> only reachable through a system portal.
 *   - `'best-effort'`    -> available but without hard guarantees.
 *   - `'limited'`        -> available with known limitations.
 * @module
 */

/** A capability that is either supported or constrained. */
export type CapabilityState = boolean | 'user-selected' | 'portal' | 'best-effort' | 'limited'

/** Full set of capabilities reported by a desktop provider. */
export interface Capabilities {
  windowEnumeration: CapabilityState
  windowCapture: CapabilityState
  accessibilityTree: CapabilityState
  foregroundInput: CapabilityState
  backgroundInput: CapabilityState
  semanticClick: CapabilityState
  clipboard: CapabilityState
  clipboardRestore: CapabilityState
  overlay: CapabilityState
  launchApp: CapabilityState
}

/** Windows provider advertises the full capability set. */
export function windowsCapabilities(): Capabilities {
  return {
    windowEnumeration: true,
    windowCapture: true,
    accessibilityTree: true,
    foregroundInput: true,
    backgroundInput: true,
    semanticClick: true,
    clipboard: true,
    clipboardRestore: true,
    overlay: true,
    launchApp: true,
  }
}

/** Error code returned when a capability is completely unavailable. */
export const CAPABILITY_UNAVAILABLE = 'CAPABILITY_UNAVAILABLE'
