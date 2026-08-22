/**
 * Platform-neutral tool definitions.
 *
 * The core defines the 9 computer_* tools against an injected handler set so
 * the same tool surface can be registered by Windows/macOS/Linux packages.
 * This module intentionally avoids framework imports; each package adapts it
 * to its own `defineTool`/settings/approval wiring.
 * @module
 */

export interface ToolParameter {
  type: string
  required?: boolean
  description?: string
  enum?: string[]
  items?: { type: string }
}

export interface DesktopToolDefinition {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
  timeoutMs: number
  isConcurrencySafe: () => boolean
  execute(args: Record<string, unknown>, exec?: unknown): Promise<unknown>
}

/** Handlers the host implements to back the 9 tools. */
export interface DesktopToolHandlers {
  listWindows(): Promise<unknown>
  getWindowState(args: { windowId: unknown; includeScreenshot?: boolean; includeText?: boolean }): Promise<unknown>
  activateWindow(windowId: unknown): Promise<unknown>
  click(args: Record<string, unknown>): Promise<unknown>
  typeText(args: { windowId: unknown; observationId: string; text: string }): Promise<unknown>
  pressKey(args: { windowId: unknown; observationId: string; key: string }): Promise<unknown>
  scroll(args: Record<string, unknown>): Promise<unknown>
  drag(args: Record<string, unknown>): Promise<unknown>
  launchApp(args: { app: string; args?: string[] }): Promise<unknown>
}

function params(extra: Record<string, ToolParameter>): Record<string, ToolParameter> {
  return {
    windowId: { type: 'string', required: true, description: 'Target window id (number HWND or win:hWnd: string)' },
    observationId: { type: 'string', required: true, description: 'observationId from computer_get_window_state' },
    ...extra,
  }
}

/** Build the shared 9 tool definitions from host-provided handlers. */
export function createDesktopToolDefinitions(handlers: DesktopToolHandlers): DesktopToolDefinition[] {
  return [
    {
      name: 'computer_list_apps',
      description: 'List desktop windows.',
      parameters: {},
      timeoutMs: 60_000,
      isConcurrencySafe: () => false,
      execute: () => handlers.listWindows(),
    },
    {
      name: 'computer_get_window_state',
      description: 'Capture the target window screenshot and accessibility tree.',
      parameters: {
        windowId: { type: 'string', required: true },
        includeScreenshot: { type: 'boolean' },
        includeText: { type: 'boolean' },
      },
      timeoutMs: 180_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.getWindowState(args as never),
    },
    {
      name: 'computer_activate_window',
      description: 'Activate the target window.',
      parameters: { windowId: { type: 'string', required: true } },
      timeoutMs: 60_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.activateWindow(args.windowId),
    },
    {
      name: 'computer_click',
      description: 'Click inside the observed window.',
      parameters: params({
        elementIndex: { type: 'number', description: 'UIA element index (compat)' },
        x: { type: 'number' },
        y: { type: 'number' },
        coordinateSpace: { type: 'string', enum: ['auto', 'screenshot', 'screen', 'window'] },
        mouseButton: { type: 'string', enum: ['left', 'middle', 'right'] },
        clickCount: { type: 'number' },
        clickMethod: { type: 'string', enum: ['auto', 'post', 'foreground'] },
      }),
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.click(args),
    },
    {
      name: 'computer_type_text',
      description: 'Type Unicode text into the observed window.',
      parameters: params({ text: { type: 'string', required: true } }),
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.typeText(args as never),
    },
    {
      name: 'computer_press_key',
      description: 'Send a key chord (no Windows/Meta keys).',
      parameters: params({ key: { type: 'string', required: true } }),
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.pressKey(args as never),
    },
    {
      name: 'computer_scroll',
      description: 'Scroll at the given coordinates or element.',
      parameters: params({
        elementIndex: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
        coordinateSpace: { type: 'string', enum: ['auto', 'screenshot', 'screen', 'window'] },
        scrollX: { type: 'number' },
        scrollY: { type: 'number' },
      }),
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.scroll(args),
    },
    {
      name: 'computer_drag',
      description: 'Drag from one point/element to another.',
      parameters: params({
        fromElementIndex: { type: 'number' },
        toElementIndex: { type: 'number' },
        fromX: { type: 'number' },
        fromY: { type: 'number' },
        toX: { type: 'number' },
        toY: { type: 'number' },
        coordinateSpace: { type: 'string', enum: ['auto', 'screenshot', 'screen', 'window'] },
      }),
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.drag(args),
    },
    {
      name: 'computer_launch_app',
      description: 'Launch an application (browser new-window behavior is host-specific).',
      parameters: {
        app: { type: 'string', required: true },
        args: { type: 'array', items: { type: 'string' } },
      },
      timeoutMs: 60_000,
      isConcurrencySafe: () => false,
      execute: (args) => handlers.launchApp(args as never),
    },
  ]
}
