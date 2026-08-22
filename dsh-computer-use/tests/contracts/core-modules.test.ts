import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PermissionGate } from '../../src/core/permissions.ts'
import { ApprovalGate, type ApprovalRequester } from '../../src/core/approval.ts'
import { OverlayManager, type OverlayController } from '../../src/core/overlay.ts'
import { withClipboardRestore, type Clipboards } from '../../src/core/clipboard.ts'
import { createDesktopToolDefinitions, type DesktopToolHandlers } from '../../src/core/tools.ts'

test('PermissionGate throws when control is disabled', () => {
  const gate = new PermissionGate({ isControlAllowed: () => false })
  assert.throws(() => gate.assertAllowed(), /control permission is off/)
})

test('PermissionGate allows when control is enabled', () => {
  const gate = new PermissionGate({ isControlAllowed: () => true })
  assert.doesNotThrow(() => gate.assertAllowed())
})

test('ApprovalGate skips approval when not required', async () => {
  const gate = new ApprovalGate(null, false, true)
  await assert.doesNotReject(() => gate.check({ toolName: 'x', callId: 1, reason: 'r' }))
})

test('ApprovalGate rejects when user denies', async () => {
  const requester: ApprovalRequester = { request: async () => 'denied' }
  const gate = new ApprovalGate(requester, true, false)
  await assert.rejects(() => gate.check({ toolName: 'x', callId: 1, reason: 'r' }), /rejected/)
})

test('ApprovalGate throws when requester is missing but approval is required', async () => {
  const gate = new ApprovalGate(null, true, false)
  await assert.rejects(() => gate.check({ toolName: 'x', callId: 1, reason: 'r' }), /no approval requester/)
})

test('OverlayManager hides when hideNow is called', async () => {
  let hidden = false
  const controller: OverlayController = {
    show: async () => undefined,
    hide: async () => { hidden = true },
    refresh: async () => undefined,
  }
  const overlay = new OverlayManager(controller, { enabled: true, idleMs: 5, text: 'x' })
  await overlay.show()
  assert.equal(overlay.isVisible(), true)
  await overlay.hideNow(true)
  assert.equal(overlay.isVisible(), false)
  assert.equal(hidden, true)
  await overlay.dispose()
})

test('withClipboardRestore restores clipboard after fn', async () => {
  let restored = false
  const clipboards: Clipboards = {
    save: async () => true,
    restore: async () => { restored = true; return true },
    setText: async () => true,
    paste: async () => true,
  }
  await withClipboardRestore(clipboards, async () => 42)
  assert.equal(restored, true)
})

test('createDesktopToolDefinitions returns the 9 computer tools', () => {
  const stub: DesktopToolHandlers = {
    listWindows: async () => ({}),
    getWindowState: async () => ({}),
    activateWindow: async () => ({}),
    click: async () => ({}),
    typeText: async () => ({}),
    pressKey: async () => ({}),
    scroll: async () => ({}),
    drag: async () => ({}),
    launchApp: async () => ({}),
  }
  const defs = createDesktopToolDefinitions(stub)
  assert.equal(defs.length, 9)
  assert.deepEqual(defs.map((d) => d.name), [
    'computer_list_apps',
    'computer_get_window_state',
    'computer_activate_window',
    'computer_click',
    'computer_type_text',
    'computer_press_key',
    'computer_scroll',
    'computer_drag',
    'computer_launch_app',
  ])
})
