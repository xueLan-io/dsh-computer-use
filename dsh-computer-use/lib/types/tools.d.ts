/**
 * Model-facing tools of the dsh-computer-use plugin. They proxy to the
 * Python sidecar over JSON-RPC and attach screenshots as DSH attachments so
 * a vision model (see dsh-vision-model) can analyze them.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ComputerUseConfig } from './config.ts';
/** Absolute path of the allow/deny permission file. */
export declare function permissionFilePath(config: ComputerUseConfig): string;
/** Read the permission widget state. Missing file = denied (safe default). */
export declare function isPermissionAllowed(config: ComputerUseConfig): Promise<boolean>;
/** Show the small permission widget beside the DSH chat window. */
export declare function startPermissionWidget(getConfig: () => ComputerUseConfig): Promise<void>;
/** Public cleanup called from the plugin disposer. */
export declare function disposeSidecar(): void;
interface ToolDeps {
    ctx: Context;
    getConfig: () => ComputerUseConfig;
}
export declare function defineListWindowsTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineGetWindowStateTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineActivateWindowTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineClickTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineTypeTextTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function definePressKeyTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineScrollTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineDragTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineLaunchAppTool({ ctx, getConfig }: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export {};
