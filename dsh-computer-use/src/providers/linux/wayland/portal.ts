/**
 * xdg-desktop-portal client (Wayland).
 *
 * Wayland global window control goes through the XDG Desktop Portal D-Bus
 * service. This module is a small TypeScript client that shells out to
 * `gdbus` so it can run without a native addon. Full ScreenCast/RemoteDesktop
 * require PipeWire file descriptors; that part is marked TODO.
 * @module
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PORTAL_BUS = 'org.freedesktop.portal.Desktop'
const PORTAL_OBJECT = '/org/freedesktop/portal/desktop'

/** True when the desktop portal D-Bus service is reachable. */
export async function portalAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gdbus', ['introspect', '--session', '--dest', PORTAL_BUS, '--object-path', PORTAL_OBJECT], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

/** Create a ScreenCast session and return its D-Bus object path. */
export async function createScreenCastSession(): Promise<string> {
  const { stdout } = await execFileAsync('gdbus', [
    'call', '--session', '--dest', PORTAL_BUS,
    '--object-path', PORTAL_OBJECT,
    '--method', 'org.freedesktop.portal.ScreenCast.CreateSession',
    '{}',
  ], { timeout: 5000 })
  // Response looks like: (o '/org/freedesktop/portal/desktop/session/.../',)
  const match = /'([^']+)'/.exec(stdout)
  if (!match) throw new Error('Could not parse ScreenCast session path')
  return match[1]
}

/** Create a RemoteDesktop session and return its D-Bus object path. */
export async function createRemoteDesktopSession(): Promise<string> {
  const { stdout } = await execFileAsync('gdbus', [
    'call', '--session', '--dest', PORTAL_BUS,
    '--object-path', PORTAL_OBJECT,
    '--method', 'org.freedesktop.portal.RemoteDesktop.CreateSession',
    '{}',
  ], { timeout: 5000 })
  const match = /'([^']+)'/.exec(stdout)
  if (!match) throw new Error('Could not parse RemoteDesktop session path')
  return match[1]
}

/**
 * Start a ScreenCast session and select a source.
 *
 * Full implementation requires passing PipeWire fds over D-Bus; this is the
 * protocol stub that the native/compositor-specific implementation will fill.
 */
export async function startScreenCast(): Promise<{ pipewireFd: number; nodeId: number }> {
  // TODO(wayland): complete fd passing + SelectSources/Start calls.
  throw new Error('Wayland ScreenCast fd passing is not implemented yet')
}
