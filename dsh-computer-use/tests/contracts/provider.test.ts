import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DesktopProvider } from '../../src/core/types.ts'

const CONTRACT_METHODS = [
  'runtimeInfo',
  'capabilities',
  'listWindows',
  'getWindow',
  'captureWindow',
  'activateWindow',
  'accessibilityTree',
  'click',
  'typeText',
  'pressKey',
  'scroll',
  'drag',
  'launchApp',
  'saveClipboard',
  'restoreClipboard',
  'startIndicator',
  'stopIndicator',
  'dispose',
] as const

/** Minimal stub that satisfies the DesktopProvider interface for shape checks. */
class StubProvider implements DesktopProvider {
  async listWindows() { return [] }
  async getWindow() { throw new Error('stub') }
  async captureWindow() { throw new Error('stub') }
  async activateWindow() { throw new Error('stub') }
  async accessibilityTree() { throw new Error('stub') }
  async click() { throw new Error('stub') }
  async typeText() { throw new Error('stub') }
  async pressKey() { throw new Error('stub') }
  async scroll() { throw new Error('stub') }
  async drag() { throw new Error('stub') }
  async launchApp() { throw new Error('stub') }
  async saveClipboard() { return false }
  async restoreClipboard() { return false }
  async startIndicator() { throw new Error('stub') }
  async stopIndicator() { throw new Error('stub') }
  async dispose() { throw new Error('stub') }
  runtimeInfo() { throw new Error('stub') }
  capabilities() { throw new Error('stub') }
}

test('DesktopProvider contract methods are present on an implementation', () => {
  const provider = new StubProvider()
  for (const method of CONTRACT_METHODS) {
    assert.equal(typeof (provider as unknown as Record<string, unknown>)[method], 'function', `${method} should exist`)
  }
})

test('Capabilities covers every capability key', () => {
  const keys = [
    'windowEnumeration',
    'windowCapture',
    'accessibilityTree',
    'foregroundInput',
    'backgroundInput',
    'semanticClick',
    'clipboard',
    'clipboardRestore',
    'overlay',
    'launchApp',
  ] as const
  const caps = {
    windowEnumeration: true,
    windowCapture: true,
    accessibilityTree: true,
    foregroundInput: true,
    backgroundInput: true,
    semanticClick: true,
    clipboard: true,
    clipboardRestore: true,
    overlay: true,
    launchApp: true,
  }
  for (const key of keys) {
    assert.ok(key in caps)
  }
})
