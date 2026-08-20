import * as native from 'dsh-computer-use-native';
export type Rect = native.Rect;
export type DesktopWindow = native.WindowIdentity;
export type AccessibilityNode = native.AccessibilityNode;
export type WindowState = DesktopWindow & {
    screenshotPath?: string;
    screenshotRect?: Rect;
    coordinateSpace?: 'screenshot';
    accessibilityTree?: AccessibilityNode[];
    uiaChecksum?: string;
    uiaChecksumMode?: 'full' | 'top-level';
    uiaTruncated?: boolean;
};
export type Observation = WindowState & {
    observationId: string;
    createdAt: number;
    expiresAt: number;
};
export type ActionErrorCode = 'INVALID_OBSERVATION' | 'OBSOLETE_OBSERVATION' | 'OBSERVATION_WINDOW_MISMATCH' | 'WINDOW_IDENTITY_CHANGED' | 'UIA_TREE_CHANGED' | 'PROTECTED_WINDOW' | 'WINDOW_NOT_FOUND' | 'COORDINATE_OUT_OF_BOUNDS' | 'NATIVE_PROVIDER_UNAVAILABLE' | 'ELEMENT_NOT_FOUND' | 'CLIPBOARD_FAILED';
export declare class ComputerUseError extends Error {
    readonly code: string;
    readonly recovery: 'REQUIRES_REFRESH' | 'DENY' | 'RETRY' | 'NONE';
    constructor(code: string, message: string, recovery?: ComputerUseError['recovery']);
    toJSON(): object;
}
export declare function assertSafeWindow(windowId: number, action?: string): DesktopWindow;
export declare function listWindows(): DesktopWindow[];
export declare function getWindow(id: number): DesktopWindow;
export declare function createObservation(windowId: number, value: WindowState): Observation;
export declare function validateObservation(observationId: string, windowId: number, action: string): Observation;
export type CoordinateSpace = 'auto' | 'screenshot' | 'screen' | 'window';
export declare function point(window: DesktopWindow, x: number, y: number, observation?: Observation, coordinateSpace?: CoordinateSpace): {
    x: number;
    y: number;
};
interface OverlayConfig {
    overlayEnabled: boolean;
    overlayIdleMs: number;
    overlayText: string;
    /** Deprecated: the native overlay color is fixed to the DSH brand blue; kept only for config compatibility. */
    overlayColor: string;
}
export declare function configureOverlay(config: OverlayConfig): void;
export declare function showOverlay(windowId?: number): void;
export declare function capture(windowId: number, path: string): {
    path: string;
    rect: Rect;
};
export declare function activate(windowId: number): object;
export interface ClickOptions {
    elementIndex?: number;
    clickMethod?: 'auto' | 'post';
}
export declare function click(windowId: number, x: number, y: number, button: 'left' | 'middle' | 'right', count: number, observation?: Observation, coordinateSpace?: CoordinateSpace, options?: ClickOptions): object;
export declare function typeText(windowId: number, value: string): object;
export declare function pressKey(windowId: number, value: string): object;
export interface ScrollOptions {
    elementIndex?: number;
}
export declare function scroll(windowId: number, x: number, y: number, scrollX: number, scrollY: number, observation?: Observation, coordinateSpace?: CoordinateSpace, options?: ScrollOptions): object;
export interface DragOptions {
    fromElementIndex?: number;
    toElementIndex?: number;
}
export declare function drag(windowId: number, fromX: number, fromY: number, toX: number, toY: number, observation?: Observation, coordinateSpace?: CoordinateSpace, options?: DragOptions): object;
export declare function accessibilityTree(windowId: number): {
    nodes: AccessibilityNode[];
    checksum: string;
    mode: 'full' | 'top-level';
    truncated: boolean;
};
export declare function disposeRuntime(): void;
export declare function stopControlSession(): void;
export {};
