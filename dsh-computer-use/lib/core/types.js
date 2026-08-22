/**
 * Platform-neutral provider contract.
 *
 * This is the shared `DesktopProvider` interface that Windows, macOS and Linux
 * providers implement. The core owns observation/approval/permission logic;
 * each provider owns only platform primitives.
 *
 * Phase 1 extraction: the Windows provider is the first implementation.
 * @module
 */
/** Error raised when a capability is completely unavailable. */
export function capabilityUnavailable(capability) {
    return new Error(`CAPABILITY_UNAVAILABLE: ${capability}`);
}
/** Convenience: map a CapabilityState to a boolean/unavailable error. */
export function assertCapability(state, capability) {
    if (state === false)
        throw capabilityUnavailable(capability);
}
