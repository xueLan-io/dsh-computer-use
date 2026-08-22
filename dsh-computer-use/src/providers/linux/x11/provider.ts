/**
 * Linux X11 provider.
 *
 * Talks to a long-lived native helper process over JSON-lines on stdio. The
 * helper owns the X11/XTest/AT-SPI connections; Node never links Xlib directly.
 * The helper binary does not ship in this repo yet, so calls fail with
 * `NATIVE_PROVIDER_UNAVAILABLE` when it is absent.
 * @module
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { ComputerUseError } from '../../../core/errors.ts'
import { checkLaunchApp } from '../../../core/app-launch.ts'
import type { Capabilities } from '../../../core/capability.ts'
import type {
  AccessibilityNode,
  AccessibilitySnapshot,
  ActionResult,
  CaptureResult,
  ClickRequest,
  DesktopProvider,
  DesktopWindow,
  DragRequest,
  LaunchRequest,
  LaunchResult,
  PressKeyRequest,
  RuntimeInfo,
  ScrollRequest,
  TypeTextRequest,
} from '../../../core/types.ts'

const TREE_MAX_NODES = 2000
const TREE_MAX_DEPTH = 32

interface HelperResponse {
  id: number
  ok: boolean
  value?: unknown
  code?: string
  message?: string
  recovery?: string
}

// System-level chords that must never be sent; they switch apps, spawn
// terminals or kill/close windows and can escape the controlled session.
const FORBIDDEN_X11_CHORDS: { mods: string[]; key: string }[] = [
  { mods: ['alt'], key: 'tab' },
  { mods: ['alt'], key: 'f4' },
  { mods: ['alt'], key: 'esc' },
  { mods: ['alt'], key: 'space' },
  { mods: ['ctrl'], key: 'esc' },
  { mods: ['ctrl', 'shift'], key: 'esc' },
  { mods: ['ctrl', 'alt'], key: 'delete' },
  { mods: ['ctrl', 'alt'], key: 't' },
]
function isForbiddenX11Chord(mods: string[], main: string): boolean {
  return FORBIDDEN_X11_CHORDS.some((c) => c.key === main && c.mods.every((m) => mods.includes(m)))
}

/**
 * X11 provider backed by the native helper process.
 *
 * Set `DSH_COMPUTER_USE_X11_HELPER` to point at the helper binary.
 */
export class X11Provider implements DesktopProvider {
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: Interface | null = null
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private nextId = 1

  private helperPath(): string {
    return process.env.DSH_COMPUTER_USE_X11_HELPER ?? 'dsh-computer-use-x11-helper'
  }

  private async ensureHelper(): Promise<void> {
    if (this.child && !this.child.killed) return
    const helper = this.helperPath()
    try {
      const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] })
      this.child = child as unknown as ChildProcessWithoutNullStreams
      this.lines = createInterface({ input: this.child.stdout })
      this.lines.on('line', (line) => {
        let msg: HelperResponse
        try { msg = JSON.parse(line) as HelperResponse } catch { return }
        let entry: { resolve: (v: unknown) => void; reject: (e: Error) => void } | undefined
        if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
          entry = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
        } else {
          // The helper may respond without echoing ids (single serialized
          // connection); fall back to FIFO matching.
          const first = this.pending.entries().next().value
          if (!first) return
          entry = first[1]
          this.pending.delete(first[0])
        }
        if (msg.ok) entry.resolve(msg.value)
        else entry.reject(new ComputerUseError(msg.code ?? 'HELPER_ERROR', msg.message ?? 'X11 helper error', (msg.recovery as never) ?? 'RETRY'))
      })
      this.child.on('exit', () => {
        for (const [, entry] of this.pending) {
          entry.reject(new ComputerUseError('NATIVE_PROVIDER_UNAVAILABLE', 'X11 helper exited unexpectedly', 'RETRY'))
        }
        this.pending.clear()
        this.child = null
        this.lines = null
      })
    } catch {
      throw new ComputerUseError('NATIVE_PROVIDER_UNAVAILABLE', `X11 helper not found: ${helper}`, 'RETRY')
    }
  }

  private async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensureHelper()
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const payload = JSON.stringify({ id, method, ...params })
      this.child!.stdin.write(payload + '\n')
      // Safety timeout: a dead helper should not hang the model forever.
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new ComputerUseError('X11_HELPER_TIMEOUT', `X11 helper timed out for ${method}`, 'RETRY'))
      }, 60_000)
    })
  }

  runtimeInfo(): RuntimeInfo {
    return {
      platform: 'linux',
      arch: process.arch,
      node: process.version,
      napi: undefined,
      provider: 'x11',
      capabilities: this.capabilities(),
    }
  }

  capabilities(): Capabilities {
    // Reflect what the helper actually implements today. AT-SPI tree,
    // semantic element clicks and clipboard selection are stubs, so they are
    // reported as unavailable until the native helper completes them.
    return {
      windowEnumeration: true,
      windowCapture: true,
      accessibilityTree: false,
      foregroundInput: true,
      backgroundInput: false,
      semanticClick: false,
      clipboard: false,
      clipboardRestore: false,
      overlay: false,
      launchApp: true,
    }
  }

  async listWindows(): Promise<DesktopWindow[]> {
    return (await this.request('listWindows')) as DesktopWindow[]
  }

  async getWindow(id: string): Promise<DesktopWindow> {
    const window = (await this.request('getWindow', { windowId: id })) as DesktopWindow | null
    if (!window) throw new ComputerUseError('WINDOW_NOT_FOUND', `Window ${id} does not exist`, 'REQUIRES_REFRESH')
    return window
  }

  async captureWindow(id: string, path: string): Promise<CaptureResult> {
    const result = (await this.request('captureWindow', { windowId: id, path })) as CaptureResult
    return result
  }

  async activateWindow(id: string): Promise<void> {
    await this.request('activateWindow', { windowId: id })
  }

  async accessibilityTree(id: string): Promise<AccessibilitySnapshot> {
    const value = (await this.request('accessibilityTree', { windowId: id, maxNodes: TREE_MAX_NODES, maxDepth: TREE_MAX_DEPTH })) as AccessibilitySnapshot
    return value
  }

  async click(request: ClickRequest): Promise<ActionResult> {
    const screen = await this.toScreenPoint(request.windowId, request.x, request.y, request.coordinateSpace)
    // XTest injects globally: the target window must be active first, otherwise
    // input would land on whatever window currently has focus.
    await this.activateWindow(request.windowId)
    const result = (await this.request('click', { x: screen.x, y: screen.y, button: request.button, count: request.count })) as ActionResult
    return result
  }

  async typeText(request: TypeTextRequest): Promise<ActionResult> {
    await this.activateWindow(request.windowId)
    const result = (await this.request('typeText', { text: request.text })) as ActionResult
    return result
  }

  async pressKey(request: PressKeyRequest): Promise<ActionResult> {
    const tokens = request.key.split('+').map((t) => t.trim().toLowerCase()).filter(Boolean)
    if (tokens.some((t) => ['win', 'windows', 'meta', 'cmd', 'command', 'super', 'os'].includes(t))) {
      throw new ComputerUseError('FORBIDDEN_KEY', 'Windows/Meta shortcuts are not allowed', 'DENY')
    }
    const main = tokens.pop()!
    if (isForbiddenX11Chord(tokens, main)) {
      throw new ComputerUseError('FORBIDDEN_KEY', 'System shortcut combinations are not allowed', 'DENY')
    }
    await this.activateWindow(request.windowId)
    const result = (await this.request('pressKey', { key: request.key })) as ActionResult
    return result
  }

  async scroll(request: ScrollRequest): Promise<ActionResult> {
    const screen = await this.toScreenPoint(request.windowId, request.x, request.y, request.coordinateSpace)
    await this.activateWindow(request.windowId)
    const result = (await this.request('scroll', { x: screen.x, y: screen.y, scrollX: request.scrollX, scrollY: request.scrollY })) as ActionResult
    return result
  }

  async drag(request: DragRequest): Promise<ActionResult> {
    const from = await this.toScreenPoint(request.windowId, request.fromX, request.fromY, request.coordinateSpace)
    const to = await this.toScreenPoint(request.windowId, request.toX, request.toY, request.coordinateSpace)
    await this.activateWindow(request.windowId)
    const result = (await this.request('drag', { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y })) as ActionResult
    return result
  }

  async launchApp(request: LaunchRequest): Promise<LaunchResult> {
    // Application launch is host-side; the X11 helper does not need to own it.
    const { spawn } = await import('node:child_process')
    const { app, args } = checkLaunchApp(request.app, request.args)
    const child = spawn(app, args, { detached: true, stdio: 'ignore' })
    child.unref()
    const started = await new Promise<boolean>((resolve) => {
      child.once('spawn', () => resolve(true))
      child.once('error', () => resolve(false))
    })
    if (!started) throw new ComputerUseError('NATIVE_LAUNCH_FAILED', 'Application launch failed; please verify the path or app name', 'NONE')
    return { launched: app, args, requiresObservation: true }
  }

  async saveClipboard(): Promise<boolean> {
    return false
  }

  async restoreClipboard(): Promise<boolean> {
    return false
  }

  async startIndicator(_target?: string): Promise<void> {
    // Overlay is not implemented in the X11 helper; no-op per capability.
  }

  async stopIndicator(): Promise<void> {
    // no-op
  }

  async dispose(): Promise<void> {
    if (this.child && !this.child.killed) {
      try { this.child.stdin.end() } catch { /* best effort */ }
      this.child.kill()
    }
    this.child = null
    this.lines = null
    this.pending.clear()
  }

  private async toScreenPoint(windowId: string, x: number, y: number, coordinateSpace?: string): Promise<{ x: number; y: number }> {
    const window = await this.getWindow(windowId)
    const r = window.rect
    const space = coordinateSpace ?? 'auto'
    if (space === 'screen') {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < r.left || y < r.top || x >= r.right || y >= r.bottom) {
        throw new ComputerUseError('COORDINATE_OUT_OF_BOUNDS', `Screen coordinates (${x}, ${y}) are outside the target window`, 'REQUIRES_REFRESH')
      }
      return { x, y }
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= r.width || y >= r.height) {
      throw new ComputerUseError('COORDINATE_OUT_OF_BOUNDS', `Coordinates (${x}, ${y}) are outside the window bounds ${r.width}x${r.height}`, 'REQUIRES_REFRESH')
    }
    return { x: r.left + x, y: r.top + y }
  }
}
