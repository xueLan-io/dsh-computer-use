/**
 * Provider registry.
 *
 * Exports the platform provider implementations and a tiny factory that selects
 * the current platform's provider. The Windows package keeps using its existing
 * runtime path; these exports are for the shared-core package and future
 * macOS/Linux packages.
 * @module
 */

import type { DesktopProvider } from '../core/types.ts'
import { WindowsProvider } from './windows/provider.ts'
import { MacosProvider } from './macos/provider.ts'
import { createLinuxProvider } from './linux/provider.ts'

export { WindowsProvider } from './windows/provider.ts'
export { MacosProvider } from './macos/provider.ts'
export { createLinuxProvider } from './linux/provider.ts'
export { X11Provider } from './linux/x11/provider.ts'
export { WaylandProvider } from './linux/wayland/provider.ts'

/** Create the provider for the current host platform. */
export function createProvider(): DesktopProvider {
  switch (process.platform) {
    case 'win32':
      return new WindowsProvider()
    case 'darwin':
      return new MacosProvider()
    case 'linux':
      return createLinuxProvider()
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}
