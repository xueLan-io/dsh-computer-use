/**
 * Approval abstraction.
 *
 * The core does not depend on a specific chat framework; a host embeds its
 * approval UI by implementing `ApprovalRequester`.
 * @module
 */

/** Outcome of an approval request. */
export type ApprovalOutcome = 'allowed-once' | 'denied' | 'skipped'

export interface ApprovalRequest {
  toolName: string
  callId: unknown
  reason: string
  signal?: AbortSignal
}

/** Interface implemented by the host approval UI. */
export interface ApprovalRequester {
  request(req: ApprovalRequest): Promise<ApprovalOutcome>
}

/**
 * Default approval gate.
 *
 * When `requireApproval` is false, actions are allowed without asking.
 * This mirrors the Windows behavior: approval only fires for high-risk actions
 * when enabled, and never for autonomous agent calls that opted out.
 */
export class ApprovalGate {
  private readonly requester: ApprovalRequester | null
  private readonly requireApproval: boolean
  private readonly skipWhenPolicyNever: boolean

  constructor(requester: ApprovalRequester | null, requireApproval: boolean, skipWhenPolicyNever: boolean) {
    this.requester = requester
    this.requireApproval = requireApproval
    this.skipWhenPolicyNever = skipWhenPolicyNever
  }

  async check(req: ApprovalRequest, policyNever = false): Promise<void> {
    if (!this.requireApproval) return
    if (policyNever && this.skipWhenPolicyNever) return
    if (!this.requester) {
      throw new Error('Approval is required but no approval requester is configured')
    }
    const outcome = await this.requester.request(req)
    if (outcome !== 'allowed-once') {
      throw new Error('The user rejected this computer-control action')
    }
  }
}
