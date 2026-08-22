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
    type: string;
    required?: boolean;
    description?: string;
    enum?: string[];
    items?: {
        type: string;
    };
}
export interface DesktopToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, ToolParameter>;
    timeoutMs: number;
    isConcurrencySafe: () => boolean;
    execute(args: Record<string, unknown>, exec?: unknown): Promise<unknown>;
}
/** Handlers the host implements to back the 9 tools. */
export interface DesktopToolHandlers {
    listWindows(): Promise<unknown>;
    getWindowState(args: {
        windowId: unknown;
        includeScreenshot?: boolean;
        includeText?: boolean;
    }): Promise<unknown>;
    activateWindow(windowId: unknown): Promise<unknown>;
    click(args: Record<string, unknown>): Promise<unknown>;
    typeText(args: {
        windowId: unknown;
        observationId: string;
        text: string;
    }): Promise<unknown>;
    pressKey(args: {
        windowId: unknown;
        observationId: string;
        key: string;
    }): Promise<unknown>;
    scroll(args: Record<string, unknown>): Promise<unknown>;
    drag(args: Record<string, unknown>): Promise<unknown>;
    launchApp(args: {
        app: string;
        args?: string[];
    }): Promise<unknown>;
}
/** Build the shared 9 tool definitions from host-provided handlers. */
export declare function createDesktopToolDefinitions(handlers: DesktopToolHandlers): DesktopToolDefinition[];
