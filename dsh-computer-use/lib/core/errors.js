/**
 * Unified error model for the desktop-control plugin.
 *
 * Kept independent of any platform native layer so it can be unit-tested
 * without a real desktop environment and reused across Windows/macOS/Linux
 * providers.
 * @module
 */
/**
 * Error thrown by computer-use actions. Messages are code-first English so
 * they survive translation and serialization; the `code` is the stable
 * machine-readable identifier.
 */
export class ComputerUseError extends Error {
    code;
    recovery;
    constructor(code, message, recovery = 'NONE') {
        super(message);
        this.name = 'ComputerUseError';
        this.code = code;
        this.recovery = recovery;
    }
    toJSON() {
        return { ok: false, code: this.code, recovery: this.recovery, message: this.message };
    }
}
