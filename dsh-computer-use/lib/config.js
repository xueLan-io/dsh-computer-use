/**
 * Settings namespace `computer-use` for the desktop-control plugin.
 * @module
 */
import z from '@deepseek-ai/schemastery';
/** Schemastery schema with defaults. */
export const ComputerUseConfigSchema = z.object({
    enabled: z.boolean().default(true),
    allowControl: z.boolean().default(false),
    pythonBin: z.string().default('python'),
    timeoutMs: z.number().default(120_000),
    requireApproval: z.boolean().default(true),
    skipApprovalWhenPolicyNever: z.boolean().default(true),
    screenshotDir: z.string().default('computer-use/screenshots'),
    overlayEnabled: z.boolean().default(true),
    overlayIdleMs: z.number().default(10_000),
    overlayText: z.string().default('DSH 正在控制你的电脑'),
    overlayColor: z.string().default('#2563EB'),
    permissionWidgetEnabled: z.boolean().default(false),
    permissionFile: z.string().default('computer-use.permission.json'),
});
/** Namespace name. */
export const COMPUTER_USE_NAMESPACE = 'computer-use';
/** Stable unconfigured/disabled message. */
export const DISABLED_MESSAGE = '计算机控制插件未启用：请在 DSH 设置（或 ~/.dsh/settings.yaml 的 computer-use 节）设置 enabled: true。';
