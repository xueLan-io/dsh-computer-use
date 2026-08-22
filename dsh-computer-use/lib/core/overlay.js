/**
 * Overlay state machine (renderer-agnostic).
 *
 * The provider owns the actual native overlay surface; this module keeps the
 * shared show/hide/timer policy so every platform behaves consistently.
 * @module
 */
const DEFAULT_CONFIG = {
    enabled: true,
    idleMs: 10_000,
    text: 'DSH is operating the computer',
};
/** Cross-platform overlay policy: show before actions, auto-hide after idle. */
export class OverlayManager {
    config;
    timer;
    pulse;
    visible = false;
    controller;
    constructor(controller, config = {}) {
        this.controller = controller;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    configure(config) {
        const wasEnabled = this.config.enabled;
        this.config = { ...this.config, ...config };
        if (wasEnabled && !this.config.enabled)
            void this.hideNow();
    }
    async show(target) {
        if (!this.config.enabled)
            return;
        await this.controller.show(target);
        this.visible = true;
        if (this.timer)
            clearTimeout(this.timer);
        if (this.pulse)
            clearInterval(this.pulse);
        this.pulse = setInterval(() => void this.controller.refresh().catch(() => undefined), 100);
        this.timer = setTimeout(() => void this.hideNow(true), Math.max(1_000, this.config.idleMs));
    }
    async hideNow(fade = false) {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        if (this.pulse) {
            clearInterval(this.pulse);
            this.pulse = undefined;
        }
        if (this.visible) {
            this.visible = false;
            await this.controller.hide(fade).catch(() => undefined);
        }
    }
    async dispose() {
        await this.hideNow(true);
    }
    isVisible() {
        return this.visible;
    }
}
