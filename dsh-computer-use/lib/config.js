/**
 * Settings namespace `computer-use` for the desktop-control plugin.
 * @module
 */
import z from '@deepseek-ai/schemastery';
/** Schemastery schema with defaults. */
export const ComputerUseConfigSchema = z.object({
    enabled: z.boolean().default(true),
    allowControl: z.boolean().default(false),
    requireApproval: z.boolean().default(true),
    skipApprovalWhenPolicyNever: z.boolean().default(true),
    screenshotDir: z.string().default('computer-use/screenshots'),
    screenshotRetention: z.number().default(86_400_000),
    overlayEnabled: z.boolean().default(true),
    overlayIdleMs: z.number().default(10_000),
    overlayText: z.string().default('DSH 正在操作电脑'),
    /** Deprecated: color is fixed to the DSH brand blue in the native overlay; kept only for old config compatibility. */
    overlayColor: z.string().default('#00D9FF'),
});
/** Namespace name. */
export const COMPUTER_USE_NAMESPACE = 'computer-use';
/** Stable unconfigured/disabled message. */
export const DISABLED_MESSAGE = '计算机控制插件未启用：请在 DSH 设置（或 ~/.dsh/settings.yaml 的 computer-use 节）设置 enabled: true。';
