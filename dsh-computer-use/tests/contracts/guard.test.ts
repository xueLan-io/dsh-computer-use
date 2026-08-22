import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GuardedDesktopProvider, type GuardHooks } from '../../src/core/guard.ts'
import { windowsCapabilities } from '../../src/core/capability.ts'
import type { DesktopProvider, DesktopWindow } from '../../src/core/types.ts'

class MockProvider implements DesktopProvider {
  capabilities() { return windowsCapabilities() }
  runtimeInfo() { throw new Error('stub') }
  async listWindows(): Promise<DesktopWindow[]> { return [] }
  async getWindow() { throw new Error('stub') }
  async captureWindow() { throw new Error('stub') }
  async activateWindow() { throw new Error('stub') }
  async accessibilityTree() { throw new Error('stub') }
  async click() { return { ok: true, method: 'mock' } }
  async typeText() { return { ok: true, method: 'mock' } }
  async pressKey() { return { ok: true, method: 'mock' } }
  async scroll() { return { ok: true, method: 'mock' } }
  async drag() { return { ok: true, method: 'mock' } }
  async launchApp() { throw new Error('stub') }
  async saveClipboard() { return true }
  async restoreClipboard() { return true }
  async startIndicator() { throw new Error('stub') }
  async stopIndicator() { throw new Error('stub') }
  async dispose() { throw new Error('stub') }
}

test('GuardedDesktopProvider blocks when permission is denied', async () => {
  const hooks: GuardHooks = {
    assertAllowed() { throw new Error('DSH control permission is off') },
  }
  const guarded = new GuardedDesktopProvider(new MockProvider(), hooks)
  await assert.rejects(() => guarded.listWindows(), /permission is off/)
})

test('GuardedDesktopProvider blocks unavailable capabilities', async () => {
  const provider = new MockProvider()
  const original = provider.capabilities
  provider.capabilities = () => ({ ...windowsCapabilities(), windowEnumeration: false })
  const guarded = new GuardedDesktopProvider(provider, { assertAllowed() {} })
  await assert.rejects(() => guarded.listWindows(), /CAPABILITY_UNAVAILABLE/)
})

test('GuardedDesktopProvider runs approval for high-risk actions', async () => {
  let approved = false
  const hooks: GuardHooks = {
    assertAllowed() {},
    approve: async () => { approved = true },
  }
  const guarded = new GuardedDesktopProvider(new MockProvider(), hooks)
  await guarded.click({ windowId: 'win:1', x: 0, y: 0, button: 'left', count: 1 })
  assert.equal(approved, true)
})
