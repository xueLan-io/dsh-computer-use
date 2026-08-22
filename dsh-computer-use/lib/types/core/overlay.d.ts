/**
 * Overlay state machine (renderer-agnostic).
 *
 * The provider owns the actual native overlay surface; this module keeps the
 * shared show/hide/timer policy so every platform behaves consistently.
 * @module
 */
export interface OverlayController {
    show(target?: string): Promise<void>;
    hide(fade?: boolean): Promise<void>;
    refresh(): Promise<void>;
}
export interface OverlayConfig {
    enabled: boolean;
    idleMs: number;
    text: string;
}
/** Cross-platform overlay policy: show before actions, auto-hide after idle. */
export declare class OverlayManager {
    private config;
    private timer;
    private pulse;
    private visible;
    private readonly controller;
    constructor(controller: OverlayController, config?: Partial<OverlayConfig>);
    configure(config: Partial<OverlayConfig>): void;
    show(target?: string): Promise<void>;
    hideNow(fade?: boolean): Promise<void>;
    dispose(): Promise<void>;
    isVisible(): boolean;
}
