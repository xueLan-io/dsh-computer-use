/**
 * Model-facing tools of the dsh-computer-use plugin. They proxy to the
 * Python sidecar over JSON-RPC and attach screenshots as DSH attachments so
 * a vision model (see dsh-vision-model) can analyze them.
 * @module
 */

import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { effectiveApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { ComputerUseConfig } from './config.ts'
import { DISABLED_MESSAGE } from './config.ts'
import { ComputerUseSidecar } from './sidecar.ts'

/** JSON-safe projection helper. */
function asJson<T extends object>(value: T): JsonValue {
  return value as unknown as JsonValue
}

/** Plugin data root for screenshots. */
function screenshotRoot(config: ComputerUseConfig): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return resolve(home, config.screenshotDir)
}

/** Build a unique screenshot filename for one window. */
function screenshotPathFor(config: ComputerUseConfig, windowId: number | string, kind = 'window'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(screenshotRoot(config), `${kind}-${windowId}-${stamp}.png`)
}

/** Absolute path of the allow/deny permission file. */
export function permissionFilePath(config: ComputerUseConfig): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return resolve(home, config.permissionFile)
}

/** Read the permission widget state. Missing file = denied (safe default). */
export async function isPermissionAllowed(config: ComputerUseConfig): Promise<boolean> {
  try {
    const data = JSON.parse(await readFile(permissionFilePath(config), 'utf8'))
    return (data as { allowed?: boolean }).allowed === true
  } catch {
    return false
  }
}

/** Gate one computer tool on the DSH-side permission switch(es). */
async function requirePermission(config: ComputerUseConfig): Promise<void> {
  if (config.allowControl === false) {
    throw new Error('DSH 控制权限未开启：请打开聊天框旁“允许 DSH 控制电脑”的小开关')
  }
  // 桌面授权悬浮窗启用时，它写下的 permission 文件也参与门禁（双通道都需放行）。
  if (config.permissionWidgetEnabled && !(await isPermissionAllowed(config))) {
    throw new Error('桌面授权悬浮窗未勾选“允许 DSH 控制电脑”')
  }
}

/** Show the small permission widget beside the DSH chat window. */
export async function startPermissionWidget(getConfig: () => ComputerUseConfig): Promise<void> {
  const config = getConfig()
  if (!config.permissionWidgetEnabled) return
  const sidecarInstance = getSidecar(getConfig)
  try {
    await sidecarInstance.request(
      'permission_widget_show',
      { permissionFile: permissionFilePath(config) },
      config,
      undefined,
    )
  } catch {
    // The widget is cosmetic; a failure must not break DSH startup.
  }
}

/** Save a PNG produced by the sidecar as a DSH attachment. */
async function attachScreenshot(ctx: Context, path: string): Promise<{ attachment: unknown; path: string }> {
  const data = await readFile(path)
  const ref = await ctx.attachments.saveImage({
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    mediaType: 'image/png',
    name: basename(path),
  })
  return { attachment: ref, path }
}

/** Ask the user before a high-risk desktop action. */
async function maybeApprove(
  ctx: Context,
  exec: { agent?: unknown; name: string; callId: unknown; signal: AbortSignal },
  config: ComputerUseConfig,
  reason: string,
): Promise<void> {
  if (!config.requireApproval) return
  if (exec.agent === undefined) return // programmatic calls skip interactive approval
  // 会话审批策略为 'never'（用户在界面里选了"不再询问"）时，官方 approval
  // 服务会确定性返回 'rejected'——把"不打扰用户"当成"拒绝一切"。是否跳过
  // 交互审批由 skipApprovalWhenPolicyNever 显式配置（默认 true：跳过询问，
  // 改由 requirePermission 的 allowControl 开关独立把关；设为 false 则遵循
  // 官方 fail-closed 语义，此类操作会被拒绝）。
  const agent = exec.agent as { session?: { events?: readonly unknown[] } }
  const policy = effectiveApprovalPolicy((agent.session?.events ?? []) as never)
  if (policy === 'never') {
    if (config.skipApprovalWhenPolicyNever) return
    throw new Error(
      '当前会话审批策略为“不再询问”（never），且 skipApprovalWhenPolicyNever=false，此操作被拒绝。',
    )
  }
  const outcome = await ctx.approval.request({
    agent: exec.agent as never,
    toolName: exec.name,
    callId: exec.callId as never,
    reason,
    signal: exec.signal,
  })
  if (outcome !== 'allowed-once') {
    throw new Error('用户拒绝了此计算机控制操作')
  }
}

/** Shared sidecar instance per plugin scope. */
let sidecar: ComputerUseSidecar | null = null
function getSidecar(getConfig: () => ComputerUseConfig): ComputerUseSidecar {
  if (sidecar === null) sidecar = new ComputerUseSidecar(getConfig)
  return sidecar
}

/** Public cleanup called from the plugin disposer. */
export function disposeSidecar(): void {
  sidecar?.close()
  sidecar = null
}

interface ToolDeps {
  ctx: Context
  getConfig: () => ComputerUseConfig
}

function requireEnabled(config: ComputerUseConfig): void {
  if (!config.enabled) throw new Error(DISABLED_MESSAGE)
}

/** Show (or refresh) the blue overlay + custom cursor before a desktop action. */
async function ensureOverlay(deps: ToolDeps, exec: { signal: AbortSignal }): Promise<void> {
  const config = deps.getConfig()
  if (!config.overlayEnabled) return
  try {
    await getSidecar(deps.getConfig).request(
      'overlay_begin',
      {
        idleMs: config.overlayIdleMs,
        text: config.overlayText,
        color: config.overlayColor,
      },
      config,
      exec.signal,
    )
  } catch {
    // 指示层是装饰性的：overlay 失败（Tk 初始化问题等）不能连带主操作失败。
  }
}

// ------------------------------------------------------------------ tools

export function defineListWindowsTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_list_apps',
    description:
      'computer control / desktop automation: 列出当前 Windows 桌面上可操作的应用窗口（窗口ID、标题、类名、位置）。返回的 windowId 用于 computer_get_window_state 等后续操作。',
    parameters: {},
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        const v = value as { windows?: Array<{ windowId: number; title?: string; appName?: string }> }
        const lines = (v.windows ?? []).map((w) => `- windowId=${w.windowId} title=${w.title ?? ''} app=${w.appName ?? ''}`)
        return [{ type: 'text', text: lines.length === 0 ? '（没有可用窗口）' : lines.join('\n') }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 60_000,
    // sidecar 请求是串行 + 单请求超时会连坐全部 pending，标记不可并发更安全。
    isConcurrencySafe: () => false,
    async execute(_args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const result = await getSidecar(getConfig).request<{ windows: unknown[] }>('list_windows', {}, config, exec.signal)
      return asJson(result)
    },
  })
}

export function defineGetWindowStateTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_get_window_state',
    description:
      'computer control / desktop automation: 获取某个窗口的最新状态：截图（保存为附件，vision 模型可用）和/或可访问性 UI 树（带元素索引）。动作后必须重新调用本工具刷新，因为元素索引和坐标只对当次观察有效。',
    parameters: {
      windowId: { type: 'number', required: true, description: 'computer_list_apps 返回的窗口 ID' },
      includeScreenshot: { type: 'boolean', description: '是否截图并返回图片附件，默认 true' },
      includeText: { type: 'boolean', description: '是否返回 UI Automation 元素树，默认 true' },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        const v = value as { title?: string; accessibilityTree?: string; screenshotAttachment?: unknown; screenshotPath?: string }
        const blocks: ContentBlock[] = []
        if (v.screenshotAttachment !== undefined) {
          blocks.push({ type: 'image', attachment: v.screenshotAttachment } as unknown as ContentBlock)
        }
        const parts = [`窗口：${v.title ?? ''}`]
        if (v.accessibilityTree !== undefined && v.accessibilityTree !== '') {
          parts.push(`\n可访问性树：\n${v.accessibilityTree}`)
        }
        if (v.screenshotPath !== undefined) parts.push(`\n截图文件：${v.screenshotPath}`)
        blocks.push({ type: 'text', text: parts.join('\n') })
        return blocks
      },
    },
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { windowId?: number; includeScreenshot?: boolean; includeText?: boolean }
      if (typeof call.windowId !== 'number') throw new Error('windowId 必须是数字')
      const includeScreenshot = call.includeScreenshot !== false
      const includeText = call.includeText !== false
      const screenshotPath = includeScreenshot ? screenshotPathFor(config, call.windowId) : undefined
      const raw = await getSidecar(getConfig).request<{
        windowId: number
        title?: string
        rect?: unknown
        screenshotPath?: string
        accessibilityTree?: string
      }>(
        'get_window_state',
        {
          windowId: call.windowId,
          includeScreenshot,
          includeText,
          ...(screenshotPath === undefined ? {} : { screenshotPath }),
        },
        config,
        exec.signal,
      )
      const value: Record<string, unknown> = {
        windowId: raw.windowId,
        title: raw.title ?? '',
        rect: raw.rect,
      }
      if (raw.screenshotPath !== undefined) {
        const attached = await attachScreenshot(ctx, raw.screenshotPath)
        value.screenshotPath = attached.path
        value.screenshotAttachment = attached.attachment
      }
      if (raw.accessibilityTree !== undefined) value.accessibilityTree = raw.accessibilityTree
      return asJson(value)
    },
  })
}

export function defineActivateWindowTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_activate_window',
    description: 'computer control / desktop automation: 把指定窗口带到前台并激活（focus window / bring to front）。',
    parameters: {
      windowId: { type: 'number', required: true, description: 'computer_list_apps 返回的窗口 ID' },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        const v = value as { activated?: boolean; windowId?: number }
        return [{ type: 'text', text: `已激活窗口 ${v.windowId ?? ''}（${v.activated ? '成功' : '失败'}）` }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { windowId?: number }
      if (typeof call.windowId !== 'number') throw new Error('windowId 必须是数字')
      const result = await getSidecar(getConfig).request('activate_window', { windowId: call.windowId }, config, exec.signal)
      return asJson(result as object)
    },
  })
}

export function defineClickTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_click',
    description:
      'computer control / desktop automation / mouse: 在窗口内点击：传 elementIndex 点击 UI 树中的元素，或传 x/y 窗口相对坐标点击。button: left/right/middle，clickCount 默认为 1。硬性安全限制：禁止对 DSH 聊天窗口（DeepSeek Harness）点击，否则会覆盖聊天框。',
    parameters: {
      windowId: { type: 'number', required: true, description: 'computer_list_apps 返回的窗口 ID' },
      elementIndex: { type: 'number', description: 'computer_get_window_state 返回的可访问性树中的元素索引' },
      x: { type: 'number', description: '窗口相对横坐标（与 elementIndex 二选一）' },
      y: { type: 'number', description: '窗口相对纵坐标（与 elementIndex 二选一）' },
      mouseButton: { type: 'string', description: 'left/right/middle，默认 left' },
      clickCount: { type: 'number', description: '点击次数，默认 1' },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        return [{ type: 'text', text: `点击完成：${JSON.stringify(value)}` }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { windowId?: number; elementIndex?: number; x?: number; y?: number; mouseButton?: string; clickCount?: number }
      if (typeof call.windowId !== 'number') throw new Error('windowId 必须是数字')
      await maybeApprove(ctx, exec, config, '模拟鼠标点击')
      const params: Record<string, unknown> = { windowId: call.windowId }
      if (call.elementIndex !== undefined) params.elementIndex = call.elementIndex
      if (call.x !== undefined) params.x = call.x
      if (call.y !== undefined) params.y = call.y
      if (call.mouseButton !== undefined) params.mouseButton = call.mouseButton
      if (call.clickCount !== undefined) params.clickCount = call.clickCount
      const result = await getSidecar(getConfig).request('click', params, config, exec.signal)
      return asJson(result as object)
    },
  })
}

export function defineTypeTextTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_type_text',
    description: 'computer control / desktop automation / keyboard: 向当前焦点输入文本（支持中文，通过剪贴板粘贴实现，type text / type characters）。硬性安全限制：禁止对 DSH 聊天窗口输入；需要打开网页时请先启动一个新浏览器窗口。',
    parameters: {
      windowId: { type: 'number', required: true, description: 'computer_list_apps 返回的窗口 ID' },
      text: { type: 'string', required: true, description: '要输入的文本' },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        const v = value as { typed?: boolean; chars?: number }
        return [{ type: 'text', text: `已输入 ${v.chars ?? 0} 个字符（${v.typed ? '成功' : '失败'}）` }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { windowId?: number; text?: string }
      if (typeof call.windowId !== 'number') throw new Error('windowId 必须是数字')
      if (typeof call.text !== 'string') throw new Error('text 必须是字符串')
      await maybeApprove(ctx, exec, config, `输入文本（${call.text.length} 字符）`)
      const result = await getSidecar(getConfig).request('type_text', { windowId: call.windowId, text: call.text }, config, exec.signal)
      return asJson(result as object)
    },
  })
}

export function definePressKeyTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_press_key',
    description:
      'computer control / desktop automation / keyboard: 发送键盘组合键（press hotkey / shortcut），例如 "Control_L+a"、"Control_L+Shift_L+Tab"、"Return"、"F5"。禁止使用 Windows/Meta 键。硬性安全限制：禁止对 DSH 聊天窗口按键，以免覆盖聊天框。',
    parameters: {
      windowId: { type: 'number', required: true, description: 'computer_list_apps 返回的窗口 ID' },
      key: { type: 'string', required: true, description: '按键或组合键' },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        return [{ type: 'text', text: `按键完成：${JSON.stringify(value)}` }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { windowId?: number; key?: string }
      if (typeof call.windowId !== 'number') throw new Error('windowId 必须是数字')
      if (typeof call.key !== 'string') throw new Error('key 必须是字符串')
      await maybeApprove(ctx, exec, config, `发送按键 ${call.key}`)
      const result = await getSidecar(getConfig).request('press_key', { windowId: call.windowId, key: call.key }, config, exec.signal)
      return asJson(result as object)
    },
  })
}

export function defineScrollTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_scroll',
    description: 'computer control / desktop automation / mouse: 把鼠标移到窗口内 (x,y) 并滚动 scrollY（正上负下）和 scrollX（正右负左）（scroll / wheel）。硬性安全限制：禁止对 DSH 聊天窗口滚动。',
    parameters: {
      windowId: { type: 'number', required: true, description: 'computer_list_apps 返回的窗口 ID' },
      x: { type: 'number', required: true, description: '窗口相对横坐标' },
      y: { type: 'number', required: true, description: '窗口相对纵坐标' },
      scrollX: { type: 'number', description: '水平滚动量，默认 0' },
      scrollY: { type: 'number', description: '垂直滚动量，默认 0' },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        return [{ type: 'text', text: `滚动完成：${JSON.stringify(value)}` }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { windowId?: number; x?: number; y?: number; scrollX?: number; scrollY?: number }
      if (typeof call.windowId !== 'number' || typeof call.x !== 'number' || typeof call.y !== 'number') {
        throw new Error('windowId/x/y 必须都是数字')
      }
      await maybeApprove(ctx, exec, config, '模拟滚动')
      const result = await getSidecar(getConfig).request(
        'scroll',
        { windowId: call.windowId, x: call.x, y: call.y, scrollX: call.scrollX ?? 0, scrollY: call.scrollY ?? 0 },
        config,
        exec.signal,
      )
      return asJson(result as object)
    },
  })
}

export function defineDragTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_drag',
    description: 'computer control / desktop automation / mouse: 在窗口内从 (fromX,fromY) 拖到 (toX,toY)（drag and drop）。硬性安全限制：禁止对 DSH 聊天窗口拖动。',
    parameters: {
      windowId: { type: 'number', required: true, description: 'computer_list_apps 返回的窗口 ID' },
      fromX: { type: 'number', required: true },
      fromY: { type: 'number', required: true },
      toX: { type: 'number', required: true },
      toY: { type: 'number', required: true },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        return [{ type: 'text', text: `拖动完成：${JSON.stringify(value)}` }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { windowId?: number; fromX?: number; fromY?: number; toX?: number; toY?: number }
      if (typeof call.windowId !== 'number' || typeof call.fromX !== 'number' || typeof call.fromY !== 'number'
        || typeof call.toX !== 'number' || typeof call.toY !== 'number') {
        throw new Error('windowId/fromX/fromY/toX/toY 必须都是数字')
      }
      await maybeApprove(ctx, exec, config, '模拟拖动')
      const result = await getSidecar(getConfig).request(
        'drag',
        { windowId: call.windowId, fromX: call.fromX, fromY: call.fromY, toX: call.toX, toY: call.toY },
        config,
        exec.signal,
      )
      return asJson(result as object)
    },
  })
}

export function defineLaunchAppTool({ ctx, getConfig }: ToolDeps) {
  return defineTool({
    name: 'computer_launch_app',
    description: 'computer control / desktop automation: 启动一个应用（launch / open app）：传 .exe 路径或已安装应用名（例如 notepad.exe）。启动浏览器时插件会强制加 --new-window，保证新开窗口、绝不覆盖 DSH 聊天窗口。',
    parameters: {
      app: { type: 'string', required: true, description: '要启动的应用路径或名称' },
      args: { type: 'array', items: { type: 'string' }, description: '可选的启动参数（例如 ["--new-window","about:blank"]）' },
    },
    output: {
      schema: { type: 'json' } as const,
      render(_args, value) {
        return [{ type: 'text', text: `启动应用：${JSON.stringify(value)}` }] satisfies ContentBlock[]
      },
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const config = getConfig()
      requireEnabled(config)
      await requirePermission(config)
      await ensureOverlay({ ctx, getConfig }, exec)
      const call = args as { app?: string; args?: string[] }
      if (typeof call.app !== 'string' || call.app.trim() === '') throw new Error('app 不能为空')
      await maybeApprove(ctx, exec, config, `启动应用 ${call.app}`)
      const result = await getSidecar(getConfig).request(
        'launch_app',
        { app: call.app.trim(), args: Array.isArray(call.args) ? call.args.map(String) : [] },
        config,
        exec.signal,
      )
      return asJson(result as object)
    },
  })
}
