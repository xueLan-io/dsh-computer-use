/**
 * Approval abstraction.
 *
 * The core does not depend on a specific chat framework; a host embeds its
 * approval UI by implementing `ApprovalRequester`.
 * @module
 */
/**
 * Default approval gate.
 *
 * When `requireApproval` is false, actions are allowed without asking.
 * This mirrors the Windows behavior: approval only fires for high-risk actions
 * when enabled, and never for autonomous agent calls that opted out.
 */
export class ApprovalGate {
    requester;
    requireApproval;
    skipWhenPolicyNever;
    constructor(requester, requireApproval, skipWhenPolicyNever) {
        this.requester = requester;
        this.requireApproval = requireApproval;
        this.skipWhenPolicyNever = skipWhenPolicyNever;
    }
    async check(req, policyNever = false) {
        if (!this.requireApproval)
            return;
        if (policyNever && this.skipWhenPolicyNever)
            return;
        if (!this.requester) {
            throw new Error('Approval is required but no approval requester is configured');
        }
        const outcome = await this.requester.request(req);
        if (outcome !== 'allowed-once') {
            throw new Error('The user rejected this computer-control action');
        }
    }
}
