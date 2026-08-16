/**
 * Sidecar manager: spawns `python/computer_use_helper.py` and speaks
 * newline-delimited JSON-RPC over stdio — the same transport Codex Computer
 * Use uses between `@oai/sky` and `codex-computer-use.exe`.
 * @module
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Locate the Python helper relative to this compiled module (lib/sidecar.js). */
export function helperPath() {
    const here = dirname(fileURLToPath(import.meta.url));
    // lib/ -> plugin root/python/computer_use_helper.py
    return join(here, '..', 'python', 'computer_use_helper.py');
}
/**
 * One persistent sidecar process. Requests are serialized; a fresh process is
 * started on first use and after any crash/abort.
 */
export class ComputerUseSidecar {
    child = null;
    reader = null;
    pending = new Map();
    nextId = 1;
    stderrTail = '';
    pythonBin;
    configFn;
    constructor(config) {
        this.configFn = config;
        this.pythonBin = config().pythonBin || 'python';
    }
    start(config) {
        if (this.child !== null)
            return;
        const child = spawn(this.pythonBin, [helperPath()], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.child = child;
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
            this.stderrTail = (this.stderrTail + chunk).slice(-4000);
        });
        this.reader = createInterface({ input: child.stdout });
        this.reader.on('line', (line) => {
            let response;
            try {
                response = JSON.parse(line);
            }
            catch {
                return;
            }
            const id = response.id;
            if (id === null || id === undefined)
                return;
            const pending = this.pending.get(id);
            if (pending === undefined)
                return;
            this.pending.delete(id);
            if (response.ok === true) {
                pending.resolve(response.result);
            }
            else {
                pending.reject(new Error(response.error ?? 'computer-use helper request failed'));
            }
        });
        child.on('error', (error) => {
            this.failAll(error);
            this.teardown();
        });
        child.on('exit', (code, signal) => {
            const message = `computer-use helper exited (code=${code}, signal=${signal ?? 'none'})`;
            this.failAll(new Error(message));
            this.teardown();
        });
    }
    failAll(error) {
        for (const pending of this.pending.values())
            pending.reject(error);
        this.pending.clear();
    }
    /** Reject everything with one error, appending the sidecar's stderr tail. */
    failAllWithStderr(message) {
        const tail = this.stderrTail.trim();
        this.failAll(new Error(tail.length === 0 ? message : `${message}\nhelper stderr: ${tail}`));
    }
    teardown() {
        this.reader?.close();
        this.reader = null;
        this.child = null;
    }
    /** Send one request and await the response. Aborting kills the sidecar. */
    request(method, params, config, signal) {
        return new Promise((resolve, reject) => {
            const cfg = config ?? this.configFn();
            if (!cfg.enabled) {
                reject(new Error('computer-use is disabled'));
                return;
            }
            if (signal?.aborted === true) {
                reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
                return;
            }
            try {
                this.start(cfg);
            }
            catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            const id = this.nextId++;
            const request = { id, method, params };
            const onAbort = () => {
                const pending = this.pending.get(id);
                if (pending !== undefined) {
                    this.pending.delete(id);
                    pending.reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
                }
                this.kill();
            };
            if (signal !== undefined) {
                signal.addEventListener('abort', onAbort, { once: true });
            }
            this.child?.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
                if (error !== null && error !== undefined) {
                    const pending = this.pending.get(id);
                    if (pending !== undefined) {
                        this.pending.delete(id);
                        pending.reject(error);
                    }
                }
            });
            // Hard timeout per request.
            const timer = setTimeout(() => {
                const pending = this.pending.get(id);
                if (pending !== undefined) {
                    this.pending.delete(id);
                    pending.reject(new Error(`computer-use helper timed out after ${cfg.timeoutMs}ms`));
                }
                this.kill();
            }, cfg.timeoutMs);
            // Clean up timer and abort listener once the request settles.
            const cleanup = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
            };
            const originalResolve = resolve;
            const originalReject = reject;
            this.pending.set(id, {
                resolve: (value) => {
                    cleanup();
                    originalResolve(value);
                },
                reject: (error) => {
                    cleanup();
                    originalReject(error);
                },
            });
        });
    }
    /** Stop the helper process (gives it a moment to restore cursor/overlay). */
    close() {
        if (this.child === null)
            return;
        const child = this.child;
        try {
            this.child.stdin.write(`${JSON.stringify({ id: 'close', method: 'close', params: {} })}\n`);
        }
        catch {
            // ignore
        }
        this.failAllWithStderr('computer-use helper closed');
        // Let the helper process the close (overlay_end + cursor restore) before kill.
        setTimeout(() => {
            if (this.child === child) {
                child.kill();
                this.teardown();
            }
        }, 400);
    }
    /**
     * Graceful-ish force stop (used on abort/timeout): first ask the helper to
     * run its close cleanup (overlay end + system cursor restore), then hard-kill
     * shortly after. A bare TerminateProcess would skip Python's atexit and leave
     * the blue custom cursor installed system-wide.
     */
    kill() {
        const child = this.child;
        if (child === null) {
            this.failAllWithStderr('computer-use helper killed');
            return;
        }
        this.failAllWithStderr('computer-use helper killed');
        try {
            child.stdin.write(`${JSON.stringify({ id: 'kill', method: 'close', params: {} })}\n`);
        }
        catch {
            // ignore
        }
        setTimeout(() => {
            if (this.child === child) {
                child.kill();
                this.teardown();
            }
        }, 300);
    }
}
