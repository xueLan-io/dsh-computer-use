/**
 * Pure coordinate mapping: converts window-relative / screenshot / screen
 * coordinates into actionable screen coordinates. No native dependency so it
 * can be unit-tested in isolation.
 * @module
 */
/** A window rectangle in screen space. */
export interface RectLike {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}
/** Coordinate spaces accepted by the tools. */
export type CoordinateSpace = 'auto' | 'screenshot' | 'screen' | 'window';
/**
 * Map `(x, y)` from the requested coordinate space to screen coordinates.
 *
 * `auto` / `screenshot` / `window` are all window-relative: the screenshot IS
 * the window rect, and coordinates map through the CURRENT rect so a window
 * that merely moved still receives the same relative click.
 */
export declare function point(window: RectLike, x: number, y: number, coordinateSpace?: CoordinateSpace): {
    x: number;
    y: number;
};
/** Reject a malformed UIA element index without touching native code. */
export declare function validateElementIndex(index: number): void;
