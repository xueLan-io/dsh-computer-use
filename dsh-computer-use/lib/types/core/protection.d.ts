/**
 * Brand protection: never allow DSH to control its own (or DeepSeek/Harness)
 * windows. Pure logic extracted so it can be unit-tested without native deps.
 * @module
 */
/** Minimal window identity fields needed by the brand matcher. */
export interface BrandedWindowInput {
    title: string;
    className: string;
    processPath: string;
}
/**
 * True when a window belongs to DSH / DeepSeek / Harness.
 *
 * Process-path segments are matched (not substrings) so a program living in a
 * folder like `dsh-stuff` or `mysandsh` is not mistaken for DSH itself.
 */
export declare function brandProtected(window: BrandedWindowInput): boolean;
