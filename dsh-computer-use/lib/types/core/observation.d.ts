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
import type { WindowId } from './identity.ts';
import type { Rect } from './types.ts';
import type { DesktopProvider, DesktopWindow, AccessibilityNode } from './types.ts';
/** A window state enriched with observation metadata. */
export interface Observation extends DesktopWindow {
    observationId: string;
    createdAt: number;
    expiresAt: number;
    screenshotPath?: string;
    screenshotRect?: Rect;
    coordinateSpace?: 'screenshot';
    accessibilityTree?: AccessibilityNode[];
    uiaChecksum?: string;
    uiaChecksumMode?: 'full' | 'top-level' | 'platform';
    uiaTruncated?: boolean;
    /** Session that created this observation. */
    sessionId: string;
    /** Agent inside the session that created this observation. */
    agentId: string;
}
/** Owner required to create or validate an observation. */
export interface ObservationOwner {
    sessionId: string;
    agentId: string;
}
/** Optional requirements for validating an observation. */
export interface ObservationValidationOptions {
    requireAccessibilityTree?: boolean;
    /** Caller identity; must match the observation owner (required). */
    owner: ObservationOwner;
}
/** True when two window descriptors describe the same underlying window. */
export declare function sameIdentity(a: DesktopWindow, b: DesktopWindow): boolean;
/** Create and store an observation for a window. */
export declare function createObservation(window: DesktopWindow, value: Partial<Omit<Observation, keyof DesktopWindow | "observationId" | "createdAt" | "expiresAt" | "sessionId" | "agentId">> | undefined, metadata: ObservationOwner): Observation;
/** Validate an observation against the current live window state. */
export declare function validateObservation(observationId: string, windowId: WindowId, provider: DesktopProvider, action: string, options: ObservationValidationOptions): Promise<Observation>;
/** Internal bookkeeping used by tests. */
export declare function __clearObservationsForTest(): void;
/** Current observation count (diagnostics/tests only). */
export declare function __observationCountForTest(): number;
