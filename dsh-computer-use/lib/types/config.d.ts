/**
 * Settings namespace `computer-use` for the desktop-control plugin.
 * @module
 */
import z from '@deepseek-ai/schemastery';
/** Resolved section of the `computer-use` settings namespace. */
export interface ComputerUseConfig {
    /** Master switch; all tools fail fast when false. */
    enabled: boolean;
    /** User permission: whether DSH is allowed to control the computer. */
    allowControl: boolean;
    /** Path to the Python interpreter used to launch the sidecar. */
    pythonBin: string;
    /** Per-request timeout for sidecar calls, in milliseconds. */
    timeoutMs: number;
    /** Whether high-risk actions need explicit user approval (default true). */
    requireApproval: boolean;
    /**
     * 会话审批策略为 'never'（"不再询问"）时是否跳过交互审批。
     * 官方语义中 'never' 是 fail-closed（确定性拒绝所有需要审批的操作）；
     * 开启本项后改为"跳过询问、仅由 allowControl 开关把关"，适合自动化场景。
     */
    skipApprovalWhenPolicyNever: boolean;
    /** Root directory for screenshots; relative paths resolve under DSH home. */
    screenshotDir: string;
    /** Whether to show the blue highlight overlay + custom cursor while controlling. */
    overlayEnabled: boolean;
    /** How long the overlay stays after the last action, in milliseconds. */
    overlayIdleMs: number;
    /** Text shown in the top banner. */
    overlayText: string;
    /** Highlight color (hex). */
    overlayColor: string;
    /** Whether to show the small allow/deny widget beside the DSH chat window. */
    permissionWidgetEnabled: boolean;
    /** JSON file that stores the allow/deny state (relative paths resolve under DSH home). */
    permissionFile: string;
}
/** Schemastery schema with defaults. */
export declare const ComputerUseConfigSchema: z<ComputerUseConfig>;
/** Namespace name. */
export declare const COMPUTER_USE_NAMESPACE = "computer-use";
/** Stable unconfigured/disabled message. */
export declare const DISABLED_MESSAGE = "\u8BA1\u7B97\u673A\u63A7\u5236\u63D2\u4EF6\u672A\u542F\u7528\uFF1A\u8BF7\u5728 DSH \u8BBE\u7F6E\uFF08\u6216 ~/.dsh/settings.yaml \u7684 computer-use \u8282\uFF09\u8BBE\u7F6E enabled: true\u3002";
