/**
 * Approval abstraction.
 *
 * The core does not depend on a specific chat framework; a host embeds its
 * approval UI by implementing `ApprovalRequester`.
 * @module
 */
/** Outcome of an approval request. */
export type ApprovalOutcome = 'allowed-once' | 'denied' | 'skipped';
export interface ApprovalRequest {
    toolName: string;
    callId: unknown;
    reason: string;
    signal?: AbortSignal;
}
/** Interface implemented by the host approval UI. */
export interface ApprovalRequester {
    request(req: ApprovalRequest): Promise<ApprovalOutcome>;
}
/**
 * Default approval gate.
 *
 * When `requireApproval` is false, actions are allowed without asking.
 * This mirrors the Windows behavior: approval only fires for high-risk actions
 * when enabled, and never for autonomous agent calls that opted out.
 */
export declare class ApprovalGate {
    private readonly requester;
    private readonly requireApproval;
    private readonly skipWhenPolicyNever;
    constructor(requester: ApprovalRequester | null, requireApproval: boolean, skipWhenPolicyNever: boolean);
    check(req: ApprovalRequest, policyNever?: boolean): Promise<void>;
}
