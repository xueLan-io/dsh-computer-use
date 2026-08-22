/**
 * Linux session / backend detection.
 *
 * Selects X11 vs Wayland based on environment variables and reports which
 * capabilities are realistically available. Never silently falls back from
 * Wayland to X11 unless an X11 session is explicitly available and user-authorized.
 * @module
 */

export type LinuxBackend = 'x11' | 'wayland' | 'none'

export interface LinuxDetectionResult {
  backend: LinuxBackend
  sessionType: string | null
  waylandDisplay: string | null
  display: string | null
  portalAvailable: boolean
  atSpiAvailable: boolean
  remoteDesktopAvailable: boolean
}

function env(name: string): string | null {
  const value = process.env[name]
  return value && value.length > 0 ? value : null
}

/** Detect the active Linux desktop session. */
export function detectLinux(): LinuxDetectionResult {
  const sessionType = env('XDG_SESSION_TYPE')?.toLowerCase() ?? null
  const waylandDisplay = env('WAYLAND_DISPLAY')
  const display = env('DISPLAY')
  const portalAvailable = Boolean(env('XDG_CURRENT_DESKTOP') || env('XDG_SESSION_DESKTOP') || waylandDisplay)
  // AT-SPI is commonly available through dbus; we conservatively expose it when
  // a11y bus vars are present, otherwise it is detected at runtime by the provider.
  const atSpiAvailable = Boolean(env('DBUS_SESSION_BUS_ADDRESS'))
  const remoteDesktopAvailable = portalAvailable && sessionType === 'wayland'

  let backend: LinuxBackend
  if (sessionType === 'wayland' || waylandDisplay) {
    backend = 'wayland'
  } else if (sessionType === 'x11' || display) {
    backend = 'x11'
  } else {
    backend = 'none'
  }

  return {
    backend,
    sessionType,
    waylandDisplay,
    display,
    portalAvailable,
    atSpiAvailable,
    remoteDesktopAvailable,
  }
}

/** True when the environment looks like a real X11 session. */
export function isX11(detection: LinuxDetectionResult = detectLinux()): boolean {
  return detection.backend === 'x11'
}

/** True when the environment looks like a real Wayland session. */
export function isWayland(detection: LinuxDetectionResult = detectLinux()): boolean {
  return detection.backend === 'wayland'
}
