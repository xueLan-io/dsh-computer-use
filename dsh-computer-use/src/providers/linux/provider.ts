/**
 * Linux provider entry point.
 *
 * Selects the X11 or Wayland backend based on the active session. The selection
 * is explicit: a Wayland session never falls back to X11 silently.
 * @module
 */

import type { DesktopProvider } from '../../core/types.ts'
import type { Capabilities } from '../../core/capability.ts'
import { detectLinux, type LinuxBackend } from './detection.ts'
import { X11Provider } from './x11/provider.ts'
import { WaylandProvider } from './wayland/provider.ts'

export type { LinuxBackend }
export { detectLinux, isX11, isWayland } from './detection.ts'
export { X11Provider } from './x11/provider.ts'
export { WaylandProvider } from './wayland/provider.ts'

/** Create the provider matching the current Linux session. */
export function createLinuxProvider(): DesktopProvider {
  const detection = detectLinux()
  switch (detection.backend) {
    case 'x11':
      return new X11Provider()
    case 'wayland':
      return new WaylandProvider()
    default:
      // No usable desktop session: return a Wayland-like placeholder whose
      // capability checks will surface the exact missing environment.
      return new WaylandProvider()
  }
}

/** Capability report for the current Linux backend. */
export function linuxCapabilities(): Capabilities {
  return createLinuxProvider().capabilities()
}
