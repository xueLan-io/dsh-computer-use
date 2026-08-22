/**
 * Overlay state machine (renderer-agnostic).
 *
 * The provider owns the actual native overlay surface; this module keeps the
 * shared show/hide/timer policy so every platform behaves consistently.
 * @module
 */

export interface OverlayController {
  show(target?: string): Promise<void>
  hide(fade?: boolean): Promise<void>
  refresh(): Promise<void>
}

export interface OverlayConfig {
  enabled: boolean
  idleMs: number
  text: string
}

const DEFAULT_CONFIG: OverlayConfig = {
  enabled: true,
  idleMs: 10_000,
  text: 'DSH is operating the computer',
}

/** Cross-platform overlay policy: show before actions, auto-hide after idle. */
export class OverlayManager {
  private config: OverlayConfig
  private timer: ReturnType<typeof setTimeout> | undefined
  private pulse: ReturnType<typeof setInterval> | undefined
  private visible = false

  private readonly controller: OverlayController

  constructor(controller: OverlayController, config: Partial<OverlayConfig> = {}) {
    this.controller = controller
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  configure(config: Partial<OverlayConfig>): void {
    const wasEnabled = this.config.enabled
    this.config = { ...this.config, ...config }
    if (wasEnabled && !this.config.enabled) void this.hideNow()
  }

  async show(target?: string): Promise<void> {
    if (!this.config.enabled) return
    await this.controller.show(target)
    this.visible = true
    if (this.timer) clearTimeout(this.timer)
    if (this.pulse) clearInterval(this.pulse)
    this.pulse = setInterval(() => void this.controller.refresh().catch(() => undefined), 100)
    this.timer = setTimeout(() => void this.hideNow(true), Math.max(1_000, this.config.idleMs))
  }

  async hideNow(fade = false): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined }
    if (this.pulse) { clearInterval(this.pulse); this.pulse = undefined }
    if (this.visible) {
      this.visible = false
      await this.controller.hide(fade).catch(() => undefined)
    }
  }

  async dispose(): Promise<void> {
    await this.hideNow(true)
  }

  isVisible(): boolean {
    return this.visible
  }
}
