/**
 * dsh-computer-use host half: registers the `computer-use` settings namespace
 * and the desktop-control tools. Screenshots are persisted as DSH
 * attachments so a vision model (dsh-vision-model) can analyze them.
 * @module
 */
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { COMPUTER_USE_NAMESPACE, ComputerUseConfigSchema } from "./config.js";
import { registerComputerUseRpc } from "./rpc.js";
import { defineActivateWindowTool, defineClickTool, defineDragTool, defineGetWindowStateTool, defineLaunchAppTool, defineListWindowsTool, definePressKeyTool, defineScrollTool, defineTypeTextTool, disposeRuntime, } from "./tools.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-computer-use';
/** Services required by this plugin. */
export const inject = ['tools', 'settings', 'attachments', 'approval', 'connection'];
export function apply(ctx) {
    const scope = ctx.settings.register(settingsNamespace(COMPUTER_USE_NAMESPACE), ComputerUseConfigSchema, { applies: 'live' });
    const getConfig = () => scope.get();
    ctx.effect(() => registerComputerUseRpc(ctx, scope), 'dsh-computer-use: RPC channel');
    ctx.effect(() => {
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
        ];
        return () => {
            for (const dispose of disposers)
                dispose();
            disposeRuntime();
        };
    }, 'dsh-computer-use: tool registrations');
}
