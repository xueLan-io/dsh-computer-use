/**
 * Sidecar manager: spawns `python/computer_use_helper.py` and speaks
 * newline-delimited JSON-RPC over stdio — the same transport Codex Computer
 * Use uses between `@oai/sky` and `codex-computer-use.exe`.
 * @module
 */
import type { ComputerUseConfig } from './config.ts';
/** Locate the Python helper relative to this compiled module (lib/sidecar.js). */
export declare function helperPath(): string;
/**
 * One persistent sidecar process. Requests are serialized; a fresh process is
 * started on first use and after any crash/abort.
 */
export declare class ComputerUseSidecar {
    private child;
    private reader;
    private pending;
    private nextId;
    private stderrTail;
    private pythonBin;
    private configFn;
    constructor(config: () => ComputerUseConfig);
    private start;
    private failAll;
    /** Reject everything with one error, appending the sidecar's stderr tail. */
    private failAllWithStderr;
    private teardown;
    /** Send one request and await the response. Aborting kills the sidecar. */
    request<T = unknown>(method: string, params: Record<string, unknown>, config?: ComputerUseConfig, signal?: AbortSignal): Promise<T>;
    /** Stop the helper process (gives it a moment to restore cursor/overlay). */
    close(): void;
    /**
     * Graceful-ish force stop (used on abort/timeout): first ask the helper to
     * run its close cleanup (overlay end + system cursor restore), then hard-kill
     * shortly after. A bare TerminateProcess would skip Python's atexit and leave
     * the blue custom cursor installed system-wide.
     */
    kill(): void;
}
