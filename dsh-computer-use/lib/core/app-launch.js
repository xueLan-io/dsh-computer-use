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
import { ComputerUseError } from "./errors.js";
/** Normalize both separator styles so a Windows path cannot smuggle a name. */
function basenameOf(path) {
    return path.split(/[\\/]/).pop() ?? path;
}
/**
 * Script hosts / shells / system tools that must never be launched through the
 * computer-use tool, regardless of how the caller spells their path.
 */
const BLOCKED_LAUNCH_NAMES = new Set([
    // Windows shells / script hosts / system control tools
    'cmd', 'cmd.exe',
    'powershell', 'powershell.exe',
    'pwsh', 'pwsh.exe',
    'wscript', 'wscript.exe',
    'cscript', 'cscript.exe',
    'mshta', 'mshta.exe',
    'regedit', 'regedit.exe',
    'reg', 'reg.exe',
    'taskmgr', 'taskmgr.exe',
    'conhost', 'conhost.exe',
    'rundll32', 'rundll32.exe',
    'regsvr32', 'regsvr32.exe',
    // Unix shells and interpreters
    'sh', 'bash', 'zsh', 'csh', 'tcsh', 'dash', 'ksh', 'fish',
    'python', 'python2', 'python3', 'perl', 'ruby', 'lua', 'node', 'deno', 'php',
    'osascript', 'osacompile',
    // Terminal emulators (interactive shell gateways)
    'terminal', 'iterm', 'iterm2', 'xterm', 'gnome-terminal', 'konsole',
    'alacritty', 'kitty', 'wezterm', 'wt', 'wt.exe', 'windows-terminal',
]);
/** Reject control characters that can corrupt spawn arguments on any OS. */
function hasControlChars(value) {
    return /[\u0000-\u001f\u007f]/.test(value);
}
/**
 * Validate and normalize a launch request. Throws `UNSAFE_APP` (DENY) when the
 * application is blocked, contains path traversal, or carries control chars.
 */
export function checkLaunchApp(app, args = []) {
    const value = String(app ?? '').trim();
    if (!value)
        throw new ComputerUseError('UNSAFE_APP', 'An application name or path is required', 'DENY');
    if (hasControlChars(value))
        throw new ComputerUseError('UNSAFE_APP', 'Unsafe application path', 'DENY');
    if (value.includes('..'))
        throw new ComputerUseError('UNSAFE_APP', 'Unsafe application path', 'DENY');
    const base = basenameOf(value).toLowerCase();
    // Match the executable/bundle stem too: `cmd.exe`, `Terminal.app`,
    // `cmd.bat` all reduce to the blocked name.
    const stem = base.replace(/\.(exe|app|cmd|bat|com)$/, '');
    if (BLOCKED_LAUNCH_NAMES.has(base) || BLOCKED_LAUNCH_NAMES.has(stem)) {
        throw new ComputerUseError('UNSAFE_APP', 'This application is blocked for computer-use launch', 'DENY');
    }
    const launchArgs = (args ?? []).map(String);
    for (const arg of launchArgs) {
        if (hasControlChars(arg))
            throw new ComputerUseError('UNSAFE_APP', 'Unsafe application argument', 'DENY');
    }
    return { app: value, args: launchArgs };
}
