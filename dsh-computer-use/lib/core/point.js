/**
 * Pure coordinate mapping: converts window-relative / screenshot / screen
 * coordinates into actionable screen coordinates. No native dependency so it
 * can be unit-tested in isolation.
 * @module
 */
import { ComputerUseError } from "./errors.js";
/**
 * Map `(x, y)` from the requested coordinate space to screen coordinates.
 *
 * `auto` / `screenshot` / `window` are all window-relative: the screenshot IS
 * the window rect, and coordinates map through the CURRENT rect so a window
 * that merely moved still receives the same relative click.
 */
export function point(window, x, y, coordinateSpace = 'auto') {
    if (coordinateSpace === 'screen') {
        if (!Number.isInteger(x) || !Number.isInteger(y) ||
            x < window.left || y < window.top ||
            x >= window.right || y >= window.bottom) {
            throw new ComputerUseError('COORDINATE_OUT_OF_BOUNDS', `Screen coordinates (${x}, ${y}) are outside the target window`, 'REQUIRES_REFRESH');
        }
        return { x, y };
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 ||
        x >= window.width || y >= window.height) {
        throw new ComputerUseError('COORDINATE_OUT_OF_BOUNDS', `Coordinates (${x}, ${y}) are outside the window bounds ${window.width}x${window.height}`, 'REQUIRES_REFRESH');
    }
    return { x: window.left + x, y: window.top + y };
}
/** Reject a malformed UIA element index without touching native code. */
export function validateElementIndex(index) {
    if (!Number.isInteger(index) || index < 0) {
        throw new ComputerUseError('INVALID_ELEMENT_INDEX', 'UI Automation element index must be a non-negative integer', 'DENY');
    }
}
