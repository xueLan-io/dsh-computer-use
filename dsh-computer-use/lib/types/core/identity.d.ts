/**
 * Cross-platform window/element identity.
 *
 * HWND numeric ids are Windows-specific. As the plugin grows a macOS/Linux
 * provider we need a string `WindowId`/`ElementId` scheme. Windows keeps
 * accepting the legacy numeric HWND by wrapping it in a `win:hWnd:<hex>`
 * string while the native layer continues to operate on the raw HWND.
 * @module
 */
/** Stable cross-platform window identifier (opaque string). */
export type WindowId = string;
/** Stable cross-platform element identifier (opaque string). */
export type ElementId = string;
/** Parsed components of a `WindowId` string. */
export interface ParsedWindowId {
    /** Platform tag: `win`, `mac`, `x11`, `wayland`. */
    platform: string;
    /** Backend-specific payload. */
    raw: string;
}
/** Resolve a legacy numeric HWND (or existing string) into a stable WindowId. */
export declare function resolveWindowId(input: number | string): WindowId;
/** Parse a WindowId into platform + raw payload; non-parsable returns null. */
export declare function parseWindowId(id: WindowId): ParsedWindowId | null;
/** Extract the legacy Windows HWND from a WindowId; undefined when not Windows. */
export declare function extractLegacyHwnd(id: WindowId): number | undefined;
