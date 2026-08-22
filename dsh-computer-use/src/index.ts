/**
 * dsh-computer-use host half: registers the `computer-use` settings namespace
 * and the desktop-control tools. Screenshots are persisted as DSH
 * attachments so a vision model (dsh-vision-model) can analyze them.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { COMPUTER_USE_NAMESPACE, ComputerUseConfigSchema, type ComputerUseConfig } from './config.ts'
import { registerComputerUseRpc } from './rpc.ts'
import { initRuntime } from './runtime.ts'
import {
  defineActivateWindowTool,
  defineClickTool,
  defineDragTool,
  defineGetWindowStateTool,
  defineLaunchAppTool,
  defineListWindowsTool,
  definePressKeyTool,
  defineScrollTool,
  defineTypeTextTool,
  disposeRuntime,
} from './tools.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-computer-use'

/** Services required by this plugin. */
export const inject = ['tools', 'settings', 'attachments', 'approval', 'connection']

export function apply(ctx: Context): void {
  const scope = ctx.settings.register(
    settingsNamespace(COMPUTER_USE_NAMESPACE),
    ComputerUseConfigSchema,
    { applies: 'live' },
  )
  const getConfig = (): ComputerUseConfig => scope.get()

  ctx.effect(() => registerComputerUseRpc(ctx, scope), 'dsh-computer-use: RPC channel')

  ctx.effect(() => {
    // Wire the production runtime: it constructs the guarded provider
    // (createProvider + guardProvider) that every tool call goes through.
    initRuntime({ ctx, getConfig })
    const disposers = [
      ctx.tools.register(defineListWindowsTool({ ctx, getConfig })),
      ctx.tools.register(defineGetWindowStateTool({ ctx, getConfig })),
      ctx.tools.register(defineActivateWindowTool({ ctx, getConfig })),
      ctx.tools.register(defineClickTool({ ctx, getConfig })),
      ctx.tools.register(defineTypeTextTool({ ctx, getConfig })),
      ctx.tools.register(definePressKeyTool({ ctx, getConfig })),
      ctx.tools.register(defineScrollTool({ ctx, getConfig })),
      ctx.tools.register(defineDragTool({ ctx, getConfig })),
      ctx.tools.register(defineLaunchAppTool({ ctx, getConfig })),
    ]
    return () => {
      for (const dispose of disposers) dispose()
      disposeRuntime()
    }
  }, 'dsh-computer-use: tool registrations')
}
