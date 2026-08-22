/**
 * macOS overlay (NSPanel) design.
 *
 * The overlay must never steal focus, must remain above the target window, and
 * should be click-through. The actual NSPanel implementation lives in the
 * native addon; this class is the JS-side state machine shared by providers.
 * @module
 */

export interface MacosOverlayConfig {
  text: string
  idleMs: number
  brandColor: string
}

const DEFAULT_CONFIG: MacosOverlayConfig = {
  text: 'DSH is operating the computer',
  idleMs: 10_000,
  brandColor: '#4176E6',
}

/**
 * JS-side overlay state machine.
 *
 * Native rendering methods (`create`, `show`, `refresh`, `hide`, `destroy`)
 * must be provided by the macOS addon. Until then the class keeps a no-op
 * implementation so it can be instantiated on any platform.
 */
export class MacosOverlay {
  private config: MacosOverlayConfig
  private handle = 0
  private visible = false

  constructor(config: Partial<MacosOverlayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  configure(config: Partial<MacosOverlayConfig>): void {
    this.config = { ...this.config, ...config }
  }

  async show(targetWindowId?: string): Promise<void> {
    if (!this.handle) {
      // TODO(macos-native): this.handle = native.overlayCreate()
      return
    }
    // TODO(macos-native): native.overlayShow(this.handle, targetWindowId ?? '', this.config.text)
    this.visible = true
  }

  async refresh(): Promise<void> {
    if (!this.visible || !this.handle) return
    // TODO(macos-native): native.overlayRefresh(this.handle)
  }

  async hide(fade = true): Promise<void> {
    if (!this.visible || !this.handle) return
    // TODO(macos-native): native.overlayHide(this.handle, fade)
    this.visible = false
  }

  async destroy(): Promise<void> {
    if (this.handle) {
      // TODO(macos-native): native.overlayDestroy(this.handle)
      this.handle = 0
    }
    this.visible = false
  }
}
