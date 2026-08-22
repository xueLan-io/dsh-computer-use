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
/** Windows provider advertises the full capability set. */
export function windowsCapabilities() {
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
    };
}
/** Error code returned when a capability is completely unavailable. */
export const CAPABILITY_UNAVAILABLE = 'CAPABILITY_UNAVAILABLE';
