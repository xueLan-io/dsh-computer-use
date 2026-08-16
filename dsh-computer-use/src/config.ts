/**
 * Settings namespace `computer-use` for the desktop-control plugin.
 * @module
 */

import z from '@deepseek-ai/schemastery'

/** Resolved section of the `computer-use` settings namespace. */
export interface ComputerUseConfig {
  /** Master switch; all tools fail fast when false. */
  enabled: boolean
  /** User permission: whether DSH is allowed to control the computer. */
  allowControl: boolean
  /** Path to the Python interpreter used to launch the sidecar. */
  pythonBin: string
  /** Per-request timeout for sidecar calls, in milliseconds. */
  timeoutMs: number
  /** Whether high-risk actions need explicit user approval (default true). */
  requireApproval: boolean
  /**
   * 会话审批策略为 'never'（"不再询问"）时是否跳过交互审批。
   * 官方语义中 'never' 是 fail-closed（确定性拒绝所有需要审批的操作）；
   * 开启本项后改为"跳过询问、仅由 allowControl 开关把关"，适合自动化场景。
   */
  skipApprovalWhenPolicyNever: boolean
  /** Root directory for screenshots; relative paths resolve under DSH home. */
  screenshotDir: string
  /** Whether to show the blue highlight overlay + custom cursor while controlling. */
  overlayEnabled: boolean
  /** How long the overlay stays after the last action, in milliseconds. */
  overlayIdleMs: number
  /** Text shown in the top banner. */
  overlayText: string
  /** Highlight color (hex). */
  overlayColor: string
  /** Whether to show the small allow/deny widget beside the DSH chat window. */
  permissionWidgetEnabled: boolean
  /** JSON file that stores the allow/deny state (relative paths resolve under DSH home). */
  permissionFile: string
}

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
}) as unknown as z<ComputerUseConfig>

/** Namespace name. */
export const COMPUTER_USE_NAMESPACE = 'computer-use'

/** Stable unconfigured/disabled message. */
export const DISABLED_MESSAGE =
  '计算机控制插件未启用：请在 DSH 设置（或 ~/.dsh/settings.yaml 的 computer-use 节）设置 enabled: true。'
