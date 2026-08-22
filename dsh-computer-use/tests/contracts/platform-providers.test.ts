import { test } from 'node:test'
import assert from 'node:assert/strict'

// These tests run on ANY platform (including Windows) because the providers
// load their native module lazily: constructing them and reading capabilities
// never touches the OS. This is the local safety net for macOS/Linux code
// that cannot be executed on a Windows workstation; the real native surfaces
// are verified by the GitHub Actions macos/ubuntu jobs instead.

import { detectLinux } from '../../src/providers/linux/detection.ts'
import { MacosProvider } from '../../src/providers/macos/provider.ts'
import { X11Provider } from '../../src/providers/linux/x11/provider.ts'
import { WaylandProvider } from '../../src/providers/linux/wayland/provider.ts'
import { createLinuxProvider } from '../../src/providers/linux/provider.ts'
import { resolveKeyCode } from '../../src/providers/macos/keymap.ts'

const cleanEnv = (): void => {
  for (const key of ['XDG_SESSION_TYPE', 'WAYLAND_DISPLAY', 'DISPLAY', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_DESKTOP', 'DBUS_SESSION_BUS_ADDRESS']) {
    delete process.env[key]
  }
}

const withEnv = (overrides: Record<string, string>, fn: () => unknown): unknown => {
  const saved: Record<string, string | undefined> = {}
  cleanEnv()
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key]
    process.env[key] = overrides[key]
  }
  try {
    return fn()
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]!
    }
  }
}

// ---------------------------------------------------------------------------
// Linux session detection (environment only; no native dependency)
// ---------------------------------------------------------------------------

test('detectLinux returns wayland for XDG_SESSION_TYPE=wayland', () => {
  const r = withEnv({ XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' }, () => detectLinux())
  assert.equal(r.backend, 'wayland')
  assert.equal(r.waylandDisplay, 'wayland-0')
})

test('detectLinux returns wayland when only WAYLAND_DISPLAY is set', () => {
  const r = withEnv({ WAYLAND_DISPLAY: 'wayland-1' }, () => detectLinux())
  assert.equal(r.backend, 'wayland')
})

test('detectLinux returns x11 for a plain DISPLAY session', () => {
  const r = withEnv({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }, () => detectLinux())
  assert.equal(r.backend, 'x11')
  assert.equal(r.display, ':0')
})

test('detectLinux falls back to x11 when only DISPLAY is set', () => {
  const r = withEnv({ DISPLAY: ':0' }, () => detectLinux())
  assert.equal(r.backend, 'x11')
})

test('detectLinux returns none without a usable display', () => {
  const r = withEnv({}, () => detectLinux())
  assert.equal(r.backend, 'none')
})

// ---------------------------------------------------------------------------
// Per-platform capability reports (pure, runnable everywhere)
// ---------------------------------------------------------------------------

test('MacosProvider advertises permission-gated capture and no overlay/semantic click', () => {
  const caps = new MacosProvider().capabilities()
  assert.equal(caps.windowEnumeration, true)
  assert.equal(caps.windowCapture, 'user-selected')
  assert.equal(caps.foregroundInput, true)
  assert.equal(caps.clipboard, true)
  assert.equal(caps.semanticClick, false)
  assert.equal(caps.overlay, false)
  assert.deepEqual(Object.keys(caps).sort(), [
    'accessibilityTree', 'backgroundInput', 'clipboard', 'clipboardRestore',
    'foregroundInput', 'launchApp', 'overlay', 'semanticClick',
    'windowCapture', 'windowEnumeration',
  ].sort())
})

test('X11Provider advertises implemented subset (AT-SPI/clipboard stubbed off)', () => {
  const caps = new X11Provider().capabilities()
  assert.equal(caps.windowEnumeration, true)
  assert.equal(caps.windowCapture, true)
  assert.equal(caps.foregroundInput, true)
  assert.equal(caps.accessibilityTree, false)
  assert.equal(caps.clipboard, false)
  assert.equal(caps.clipboardRestore, false)
  assert.equal(caps.overlay, false)
  assert.equal(caps.launchApp, true)
})

test('WaylandProvider advertises the restricted-compatibility mode', () => {
  const caps = new WaylandProvider().capabilities()
  assert.equal(caps.windowEnumeration, false)
  assert.equal(caps.windowCapture, false)
  assert.equal(caps.foregroundInput, false)
  assert.equal(caps.clipboard, 'limited')
  assert.equal(caps.clipboardRestore, false)
  assert.equal(caps.overlay, false)
  assert.equal(caps.launchApp, true)
})

test('createLinuxProvider selects the backend from the active session', () => {
  const waylandCaps = withEnv(
    { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/dev/null' },
    () => createLinuxProvider().capabilities(),
  )
  assert.equal(waylandCaps.launchApp, true)
  assert.equal(waylandCaps.windowEnumeration, false)

  const x11Caps = withEnv({ DISPLAY: ':0' }, () => createLinuxProvider().capabilities())
  assert.equal(x11Caps.windowEnumeration, true)
  assert.equal(x11Caps.windowCapture, true)
})

// ---------------------------------------------------------------------------
// macOS key mapping (pure)
// ---------------------------------------------------------------------------

test('resolveKeyCode maps named keys and ASCII to Apple virtual keycodes', () => {
  assert.equal(resolveKeyCode('return'), 36)
  assert.equal(resolveKeyCode('enter'), 36)
  assert.equal(resolveKeyCode('a'), 0)
  assert.equal(resolveKeyCode('1'), 18)
  assert.equal(resolveKeyCode('esc'), 53)
  assert.equal(resolveKeyCode('cmd'), undefined)  // 'cmd' has no code; rejected as a meta key earlier
})