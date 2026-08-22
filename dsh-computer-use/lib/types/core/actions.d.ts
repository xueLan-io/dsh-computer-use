/**
 * Platform-neutral action wrappers.
 *
 * These helpers take a provider + validated observation and turn a high-level
 * action request into the provider call, adding the standard action result
 * shape. The core layer is responsible for observation validation (including
 * session isolation and identity re-verification); these functions keep that
 * call site uniform across platforms.
 * @module
 */
import { type Observation, type ObservationOwner } from './observation.ts';
import type { ActionResult, ClickRequest, DesktopProvider, DragRequest, ScrollRequest, WindowId } from './types.ts';
export interface ActionContext {
    provider: DesktopProvider;
    observation?: Observation;
    /** Owner required by observation validation (session isolation). */
    owner: ObservationOwner;
    action: string;
    windowId: WindowId;
    /** Isolation key for clipboard snapshots taken by type actions. */
    clipboardKey?: string;
}
/** Wrap a click action. */
export declare function runClick(ctx: ActionContext, request: Omit<ClickRequest, 'windowId'>): Promise<ActionResult>;
/** Wrap a typeText action. */
export declare function runTypeText(ctx: ActionContext, text: string): Promise<ActionResult>;
/** Wrap a pressKey action. */
export declare function runPressKey(ctx: ActionContext, key: string): Promise<ActionResult>;
/** Wrap a scroll action. */
export declare function runScroll(ctx: ActionContext, request: Omit<ScrollRequest, 'windowId'>): Promise<ActionResult>;
/** Wrap a drag action. */
export declare function runDrag(ctx: ActionContext, request: Omit<DragRequest, 'windowId'>): Promise<ActionResult>;
