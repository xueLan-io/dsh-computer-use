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

import { ComputerUseError } from './errors.ts'
import { validateObservation, type Observation, type ObservationOwner } from './observation.ts'
import type {
  ActionResult,
  ClickRequest,
  DesktopProvider,
  DragRequest,
  ScrollRequest,
  WindowId,
} from './types.ts'

export interface ActionContext {
  provider: DesktopProvider
  observation?: Observation
  /** Owner required by observation validation (session isolation). */
  owner: ObservationOwner
  action: string
  windowId: WindowId
  /** Isolation key for clipboard snapshots taken by type actions. */
  clipboardKey?: string
}

async function prepare(ctx: ActionContext, requireTree = false): Promise<Observation> {
  if (!ctx.observation?.observationId) {
    throw new ComputerUseError('INVALID_OBSERVATION', 'Action must use the observationId returned by the latest observation', 'REQUIRES_REFRESH')
  }
  const validated = await validateObservation(ctx.observation.observationId, ctx.windowId, ctx.provider, ctx.action, {
    requireAccessibilityTree: requireTree,
    owner: ctx.owner,
  })
  // TOCTOU narrowing: ask the platform to re-verify the observed window right
  // before the provider touches it. Providers that cannot detect handle reuse
  // simply omit assertIdentity.
  if (ctx.provider.assertIdentity) {
    await ctx.provider.assertIdentity(ctx.windowId, validated.generation)
  }
  return validated
}

/** Wrap a click action. */
export async function runClick(ctx: ActionContext, request: Omit<ClickRequest, 'windowId'>): Promise<ActionResult> {
  await prepare(ctx, request.elementId !== undefined || request.elementIndex !== undefined)
  return ctx.provider.click({ ...request, windowId: ctx.windowId })
}

/** Wrap a typeText action. */
export async function runTypeText(ctx: ActionContext, text: string): Promise<ActionResult> {
  await prepare(ctx)
  return ctx.provider.typeText({ windowId: ctx.windowId, text, clipboardKey: ctx.clipboardKey })
}

/** Wrap a pressKey action. */
export async function runPressKey(ctx: ActionContext, key: string): Promise<ActionResult> {
  await prepare(ctx)
  return ctx.provider.pressKey({ windowId: ctx.windowId, key })
}

/** Wrap a scroll action. */
export async function runScroll(ctx: ActionContext, request: Omit<ScrollRequest, 'windowId'>): Promise<ActionResult> {
  await prepare(ctx, request.elementId !== undefined || request.elementIndex !== undefined)
  return ctx.provider.scroll({ ...request, windowId: ctx.windowId })
}

/** Wrap a drag action. */
export async function runDrag(ctx: ActionContext, request: Omit<DragRequest, 'windowId'>): Promise<ActionResult> {
  const usesElements = request.fromElementId !== undefined || request.toElementId !== undefined ||
    request.fromElementIndex !== undefined || request.toElementIndex !== undefined
  await prepare(ctx, usesElements)
  return ctx.provider.drag({ ...request, windowId: ctx.windowId })
}