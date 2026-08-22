/**
 * Permission (allowControl) abstraction.
 *
 * The host grants/revokes the master "allow DSH to control the computer"
 * switch. The core uses this gate to fail fast when control is disabled.
 * @module
 */
/**
 * Gates every desktop-control tool. Revoking permission also invalidates the
 * current observation session; the caller is responsible for calling
 * `onRevoke` when the value changes.
 */
export class PermissionGate {
    allowed;
    provider;
    onRevoke;
    constructor(provider, onRevoke) {
        this.provider = provider;
        this.onRevoke = onRevoke;
        this.allowed = provider.isControlAllowed();
    }
    /** Assert control is allowed; throws a stable message otherwise. */
    assertAllowed() {
        this.allowed = this.provider.isControlAllowed();
        if (!this.allowed) {
            if (this.onRevoke)
                this.onRevoke();
            throw new Error('DSH control permission is off');
        }
    }
    /** Refresh the cached permission state. */
    refresh() {
        this.allowed = this.provider.isControlAllowed();
    }
}
