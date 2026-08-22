/**
 * Observation lifecycle for the platform-neutral core.
 *
 * This is the Phase-1 version of the Windows observation logic: it depends on
 * the `DesktopProvider` interface instead of a concrete native addon, so it can
 * be unit-tested with a mock provider and reused across platforms.
 *
 * Isolation contract:
 * - Every observation is owned by one (session, agent) pair. Creation requires
 *   the owner; validation rejects observations owned by a different pair, so a
 *   known observationId cannot be replayed across sessions.
 * - observationIds carry 128 bits of randomness from `randomUUID` (no
 *   truncation), so ids are unpredictable and cannot be guessed.
 * @module
 */
import { ComputerUseError } from "./errors.js";
import { randomUUID } from 'node:crypto';
import { brandProtected } from "./protection.js";
const observations = new Map();
// Observations stay valid for 3 minutes (matches the frozen Windows baseline).
const OBSERVATION_TTL = 180_000;
// A window that moved is still the same UI; only a size change invalidates the
// screenshot geometry.
const RECT_TOLERANCE = 8;
const MAX_OBSERVATIONS = 128;
/** True when two window descriptors describe the same underlying window. */
export function sameIdentity(a, b) {
    return (a.windowId === b.windowId &&
        a.processId === b.processId &&
        a.processPath === b.processPath &&
        a.className === b.className &&
        // A window "generation" mismatch means the HWND/XID was re-used by a new
        // window; treat it as a different window even if the rest matches. Both
        // sides must carry the same token (undefined matches undefined for mocks).
        a.generation === b.generation);
}
/** Create and store an observation for a window. */
export function createObservation(window, value = {}, metadata) {
    if (!metadata?.sessionId || !metadata?.agentId) {
        throw new ComputerUseError('INVALID_OBSERVATION', 'Observations require a session and agent identity', 'REQUIRES_REFRESH');
    }
    const now = Date.now();
    const observationId = `obs_${window.windowId.replace(/[^a-zA-Z0-9]/g, '_')}_${now.toString(36)}_${randomUUID().replaceAll('-', '')}`;
    const item = {
        ...window,
        ...value,
        sessionId: metadata.sessionId,
        agentId: metadata.agentId,
        windowId: window.windowId,
        observationId,
        createdAt: now,
        expiresAt: now + OBSERVATION_TTL,
    };
    observations.set(observationId, item);
    while (observations.size > MAX_OBSERVATIONS) {
        observations.delete(observations.keys().next().value);
    }
    return item;
}
async function validateAccessibilityTree(old, windowId, provider, action) {
    if (!old.uiaChecksum) {
        throw new ComputerUseError('UIA_OBSERVATION_REQUIRED', `Action ${action} requires a UI Automation observation; please re-observe the window`, 'REQUIRES_REFRESH');
    }
    let current;
    try {
        current = await provider.accessibilityTree(windowId);
    }
    catch {
        throw new ComputerUseError('UIA_PROVIDER_UNAVAILABLE', 'Could not read the target window UI Automation state', 'RETRY');
    }
    if (current.checksum !== old.uiaChecksum ||
        (old.uiaChecksumMode !== undefined && current.mode !== old.uiaChecksumMode) ||
        (old.uiaTruncated !== undefined && current.truncated !== old.uiaTruncated)) {
        throw new ComputerUseError('UIA_TREE_CHANGED', `Window UI Automation tree changed; cannot perform ${action}`, 'REQUIRES_REFRESH');
    }
}
/** Validate an observation against the current live window state. */
export async function validateObservation(observationId, windowId, provider, action, options) {
    const old = observations.get(observationId);
    if (!old)
        throw new ComputerUseError('INVALID_OBSERVATION', 'Invalid observationId; please re-observe', 'REQUIRES_REFRESH');
    if (old.windowId !== windowId) {
        throw new ComputerUseError('OBSERVATION_WINDOW_MISMATCH', 'observationId does not belong to the target window; please re-observe', 'REQUIRES_REFRESH');
    }
    if (old.sessionId !== options.owner.sessionId || old.agentId !== options.owner.agentId) {
        throw new ComputerUseError('OBSERVATION_SESSION_MISMATCH', 'This observation belongs to another session; please re-observe', 'REQUIRES_REFRESH');
    }
    if (old.expiresAt <= Date.now()) {
        observations.delete(observationId);
        throw new ComputerUseError('OBSOLETE_OBSERVATION', 'Observation expired; please re-fetch the window state', 'REQUIRES_REFRESH');
    }
    let current;
    try {
        current = await provider.getWindow(windowId);
    }
    catch {
        throw new ComputerUseError('WINDOW_NOT_FOUND', `Window ${windowId} does not exist`, 'REQUIRES_REFRESH');
    }
    const sizeMoved = Math.abs(current.rect.width - old.rect.width) > RECT_TOLERANCE ||
        Math.abs(current.rect.height - old.rect.height) > RECT_TOLERANCE;
    if (!sameIdentity(current, old) || sizeMoved) {
        throw new ComputerUseError('WINDOW_IDENTITY_CHANGED', `Window state changed; cannot perform ${action}`, 'REQUIRES_REFRESH');
    }
    if (brandProtected(current)) {
        throw new ComputerUseError('PROTECTED_WINDOW', 'Operation on a protected DSH window is forbidden', 'DENY');
    }
    if (options.requireAccessibilityTree) {
        await validateAccessibilityTree(old, windowId, provider, action);
    }
    return old;
}
/** Internal bookkeeping used by tests. */
export function __clearObservationsForTest() {
    observations.clear();
}
/** Current observation count (diagnostics/tests only). */
export function __observationCountForTest() {
    return observations.size;
}
