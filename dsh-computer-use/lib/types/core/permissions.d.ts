/**
 * Permission (allowControl) abstraction.
 *
 * The host grants/revokes the master "allow DSH to control the computer"
 * switch. The core uses this gate to fail fast when control is disabled.
 * @module
 */
/** Interface implemented by the host settings layer. */
export interface PermissionProvider {
    /** Whether DSH is currently allowed to control the computer. */
    isControlAllowed(): boolean;
}
/**
 * Gates every desktop-control tool. Revoking permission also invalidates the
 * current observation session; the caller is responsible for calling
 * `onRevoke` when the value changes.
 */
export declare class PermissionGate {
    private allowed;
    private readonly provider;
    private readonly onRevoke?;
    constructor(provider: PermissionProvider, onRevoke?: () => void);
    /** Assert control is allowed; throws a stable message otherwise. */
    assertAllowed(): void;
    /** Refresh the cached permission state. */
    refresh(): void;
}
