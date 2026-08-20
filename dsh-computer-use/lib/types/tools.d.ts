import type { Context } from '@deepseek-ai/cordis';
import type { ComputerUseConfig } from './config.ts';
interface ToolDeps {
    ctx: Context;
    getConfig: () => ComputerUseConfig;
}
export declare function defineListWindowsTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineGetWindowStateTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineActivateWindowTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineClickTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineTypeTextTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function definePressKeyTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineScrollTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineDragTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function defineLaunchAppTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function disposeRuntime(): void;
export declare function stopControlSession(): void;
export {};
