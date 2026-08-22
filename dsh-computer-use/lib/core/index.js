/**
 * Public surface of the platform-neutral core.
 *
 * Phase-0/1 extract of pure, unit-testable logic that will later grow into the
 * `dsh-computer-use-core` package shared by the Windows/macOS/Linux providers.
 * @module
 */
export * from "./errors.js";
export * from "./identity.js";
export * from "./capability.js";
export * from "./protection.js";
export * from "./point.js";
export * from "./observation-element.js";
export * from "./types.js";
export * from "./observation.js";
export * from "./actions.js";
export * from "./approval.js";
export * from "./permissions.js";
export * from "./overlay.js";
export * from "./clipboard.js";
export * from "./tools.js";
export * from "./guard.js";
