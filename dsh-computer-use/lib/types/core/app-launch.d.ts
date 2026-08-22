/**
 * Launch-request hardening shared by the tool entry and every provider.
 *
 * The blacklist is defense-in-depth, NOT an isolation boundary: launching an
 * arbitrary application with arbitrary arguments is inherently powerful. Every
 * launch path MUST therefore also pass the user approval gate (see guard.ts).
 * These checks close the concrete bypasses found in review: separator
 * confusion (`C:\Windows\System32\cmd.exe` passed the old `/`-only split),
 * missing macOS/Linux block lists, control characters, and path traversal.
 * @module
 */
export interface AppLaunch {
    app: string;
    args: string[];
}
/**
 * Validate and normalize a launch request. Throws `UNSAFE_APP` (DENY) when the
 * application is blocked, contains path traversal, or carries control chars.
 */
export declare function checkLaunchApp(app: unknown, args?: readonly unknown[]): AppLaunch;
