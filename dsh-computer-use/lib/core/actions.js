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
import { ComputerUseError } from "./errors.js";
import { validateObservation } from "./observation.js";
async function prepare(ctx, requireTree = false) {
    if (!ctx.observation?.observationId) {
        throw new ComputerUseError('INVALID_OBSERVATION', 'Action must use the observationId returned by the latest observation', 'REQUIRES_REFRESH');
    }
    const validated = await validateObservation(ctx.observation.observationId, ctx.windowId, ctx.provider, ctx.action, {
        requireAccessibilityTree: requireTree,
        owner: ctx.owner,
    });
    // TOCTOU narrowing: ask the platform to re-verify the observed window right
    // before the provider touches it. Providers that cannot detect handle reuse
    // simply omit assertIdentity.
    if (ctx.provider.assertIdentity) {
        await ctx.provider.assertIdentity(ctx.windowId, validated.generation);
    }
    return validated;
}
/** Wrap a click action. */
export async function runClick(ctx, request) {
    await prepare(ctx, request.elementId !== undefined || request.elementIndex !== undefined);
    return ctx.provider.click({ ...request, windowId: ctx.windowId });
}
/** Wrap a typeText action. */
export async function runTypeText(ctx, text) {
    await prepare(ctx);
    return ctx.provider.typeText({ windowId: ctx.windowId, text, clipboardKey: ctx.clipboardKey });
}
/** Wrap a pressKey action. */
export async function runPressKey(ctx, key) {
    await prepare(ctx);
    return ctx.provider.pressKey({ windowId: ctx.windowId, key });
}
/** Wrap a scroll action. */
export async function runScroll(ctx, request) {
    await prepare(ctx, request.elementId !== undefined || request.elementIndex !== undefined);
    return ctx.provider.scroll({ ...request, windowId: ctx.windowId });
}
/** Wrap a drag action. */
export async function runDrag(ctx, request) {
    const usesElements = request.fromElementId !== undefined || request.toElementId !== undefined ||
        request.fromElementIndex !== undefined || request.toElementIndex !== undefined;
    await prepare(ctx, usesElements);
    return ctx.provider.drag({ ...request, windowId: ctx.windowId });
}
