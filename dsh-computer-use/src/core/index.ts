/**
 * Public surface of the platform-neutral core.
 *
 * Phase-0/1 extract of pure, unit-testable logic that will later grow into the
 * `dsh-computer-use-core` package shared by the Windows/macOS/Linux providers.
 * @module
 */

export * from './errors.ts'
export * from './identity.ts'
export * from './capability.ts'
export * from './protection.ts'
export * from './point.ts'
export * from './observation-element.ts'
export * from './types.ts'
export * from './observation.ts'
export * from './actions.ts'
export * from './approval.ts'
export * from './permissions.ts'
export * from './overlay.ts'
export * from './clipboard.ts'
export * from './tools.ts'
export * from './guard.ts'
