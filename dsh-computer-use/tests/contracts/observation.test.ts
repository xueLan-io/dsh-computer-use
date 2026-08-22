import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createObservation,
  validateObservation,
  __clearObservationsForTest,
} from '../../src/core/observation.ts'
import { ComputerUseError } from '../../src/core/errors.ts'
import type { DesktopProvider, DesktopWindow, AccessibilitySnapshot } from '../../src/core/types.ts'

const OWNER = { sessionId: 'session-1', agentId: 'agent-1' }
const OTHER_OWNER = { sessionId: 'session-2', agentId: 'agent-2' }

function makeWindow(id: string, overrides: Partial<DesktopWindow> = {}): DesktopWindow {
  return {
    windowId: id,
    title: 'Test Window',
    appName: 'test',
    processId: 1,
    processPath: 'C:/apps/test.exe',
    className: 'TestClass',
    rect: { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 },
    visible: true,
    minimized: false,
    onScreen: true,
    foreground: true,
    dpi: 96,
    ...overrides,
  }
}

class MockProvider implements DesktopProvider {
  windows = new Map<string, DesktopWindow>()
  trees = new Map<string, AccessibilitySnapshot>()

  async getWindow(id: string): Promise<DesktopWindow> {
    const w = this.windows.get(id)
    if (!w) throw new Error('not found')
    return w
  }

  async accessibilityTree(id: string): Promise<AccessibilitySnapshot> {
    const t = this.trees.get(id)
    if (!t) throw new Error('no tree')
    return t
  }

  async listWindows() { return [...this.windows.values()] }
  async captureWindow() { throw new Error('unused') }
  async activateWindow() { throw new Error('unused') }
  async click() { throw new Error('unused') }
  async typeText() { throw new Error('unused') }
  async pressKey() { throw new Error('unused') }
  async scroll() { throw new Error('unused') }
  async drag() { throw new Error('unused') }
  async launchApp() { throw new Error('unused') }
  async saveClipboard() { return false }
  async restoreClipboard() { return false }
  async startIndicator() { throw new Error('unused') }
  async stopIndicator() { throw new Error('unused') }
  async dispose() { throw new Error('unused') }
  runtimeInfo() { throw new Error('unused') }
  capabilities() { throw new Error('unused') }
}

let provider: MockProvider
let winA: DesktopWindow
let winB: DesktopWindow

beforeEach(() => {
  __clearObservationsForTest()
  provider = new MockProvider()
  winA = makeWindow('win:hWnd:0000000000000001')
  winB = makeWindow('win:hWnd:0000000000000002')
  provider.windows.set(winA.windowId, winA)
  provider.windows.set(winB.windowId, winB)
})

test('createObservation generates a valid observationId with full entropy', () => {
  const obs = createObservation(winA, {}, OWNER)
  assert.match(obs.observationId, /^obs_/)
  assert.equal(obs.windowId, winA.windowId)
  assert.ok(obs.expiresAt > obs.createdAt)
  // 128 bits of randomness: the randomUUID tail is NOT truncated to 12 hex
  // chars anymore (review: previous slice kept only ~48 bits).
  const randomPart = obs.observationId.split('_').pop()!
  assert.equal(randomPart.length, 32)
  assert.match(randomPart, /^[0-9a-f]{32}$/)
  assert.equal(obs.sessionId, OWNER.sessionId)
  assert.equal(obs.agentId, OWNER.agentId)
})

test('createObservation rejects observations without an owner', () => {
  assert.throws(() => createObservation(winA, {} as never), ComputerUseError)
})

test('validateObservation rejects an observation from another session (replay protection)', async () => {
  const obs = createObservation(winA, {}, OWNER)
  await assert.rejects(
    validateObservation(obs.observationId, winA.windowId, provider, 'click', { owner: OTHER_OWNER }),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'OBSERVATION_SESSION_MISMATCH',
  )
  // The same session can use it normally.
  await validateObservation(obs.observationId, winA.windowId, provider, 'click', { owner: OWNER })
})

test('validateObservation rejects a window generation change', async () => {
  const obs = createObservation(winA, {}, OWNER)
  // HWND value was re-used by a NEW window: same pid/path/class, new generation.
  provider.windows.set(winA.windowId, { ...winA, generation: (winA.generation ?? 0) + 1 })
  await assert.rejects(
    validateObservation(obs.observationId, winA.windowId, provider, 'click', { owner: OWNER }),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'WINDOW_IDENTITY_CHANGED',
  )
})

test('validateObservation rejects an obsolete observation', async () => {
  const obs = createObservation(winA, {}, OWNER)
  // Artificially expire it.
  ;(obs as { expiresAt: number }).expiresAt = Date.now() - 1
  await assert.rejects(
    validateObservation(obs.observationId, winA.windowId, provider, 'click', { owner: OWNER }),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'OBSOLETE_OBSERVATION',
  )
})

test('validateObservation rejects a window mismatch', async () => {
  const obs = createObservation(winA, {}, OWNER)
  await assert.rejects(
    validateObservation(obs.observationId, winB.windowId, provider, 'click', { owner: OWNER }),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'OBSERVATION_WINDOW_MISMATCH',
  )
})

test('validateObservation rejects protected DSH windows', async () => {
  const protectedWin = makeWindow('win:hWnd:0000000000000099', { processPath: 'C:/Program Files/DSH/dsh.exe' })
  const obs = createObservation(protectedWin, {}, OWNER)
  provider.windows.set(protectedWin.windowId, protectedWin)
  await assert.rejects(
    validateObservation(obs.observationId, protectedWin.windowId, provider, 'click', { owner: OWNER }),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'PROTECTED_WINDOW',
  )
})

test('validateObservation rejects a changed window identity', async () => {
  const obs = createObservation(winA, {}, OWNER)
  provider.windows.set(winA.windowId, { ...winA, processId: 999 })
  await assert.rejects(
    validateObservation(obs.observationId, winA.windowId, provider, 'click', { owner: OWNER }),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'WINDOW_IDENTITY_CHANGED',
  )
})

test('validateObservation rejects when the accessibility tree changed', async () => {
  const obs = createObservation(winA, {
    uiaChecksum: 'abc',
    uiaChecksumMode: 'full',
    uiaTruncated: false,
  }, OWNER)
  provider.trees.set(winA.windowId, {
    nodes: [],
    checksum: 'different',
    mode: 'full',
    truncated: false,
  })
  await assert.rejects(
    validateObservation(obs.observationId, winA.windowId, provider, 'click', { owner: OWNER, requireAccessibilityTree: true }),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'UIA_TREE_CHANGED',
  )
})

test('validateObservation passes for a fresh valid observation', async () => {
  const obs = createObservation(winA, { uiaChecksum: 'abc', uiaChecksumMode: 'full', uiaTruncated: false }, OWNER)
  provider.trees.set(winA.windowId, {
    nodes: [],
    checksum: 'abc',
    mode: 'full',
    truncated: false,
  })
  const result = await validateObservation(obs.observationId, winA.windowId, provider, 'click', { owner: OWNER, requireAccessibilityTree: true })
  assert.equal(result.observationId, obs.observationId)
})