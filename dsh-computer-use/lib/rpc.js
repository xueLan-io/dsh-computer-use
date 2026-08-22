/**
 * `/computer-use` RPC channel (loopback): lets the DSH web bubble read and
 * toggle the desktop-control permission (`allowControl`) without relying on
 * the Host api-proxy settings allowlist — third-party namespaces are not
 * exposed to the browser by default, so the bubble must ride its own channel.
 * @module
 */
import { stopControlSession } from "./runtime.js";
/** Loopback RPC channel used by the permission bubble. */
export const COMPUTER_USE_RPC_CHANNEL = '/computer-use';
function ok(value) {
    return { ok: true, value };
}
/** Local catch-all error branch (avoids a runtime import from dsh-host-apiproxy). */
function rpcError(error) {
    return {
        ok: false,
        error: {
            code: 'internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
        },
    };
}
/**
 * Register the loopback RPC channel. Returns a disposer for the plugin's
 * effect lifecycle.
 */
export function registerComputerUseRpc(ctx, scope) {
    const handle = ctx.connection.rpc.handle(COMPUTER_USE_RPC_CHANNEL, async (endpoint, payload) => {
        try {
            switch (endpoint) {
                case 'allowControl/get': {
                    // 读取当前授权状态（默认未授权）。
                    return ok({ allowed: scope.get().allowControl === true });
                }
                case 'allowControl/set': {
                    // 写入授权状态；只有显式 true 才算授权。
                    const value = (payload ?? {});
                    const allowed = value.allowed === true;
                    const changed = scope.get().allowControl !== allowed;
                    await scope.update({ allowControl: allowed });
                    if (changed)
                        stopControlSession();
                    return ok({ allowed: scope.get().allowControl === true });
                }
                default: {
                    return rpcError(new Error(`DSH Computer Use RPC 未知端点: ${endpoint}`));
                }
            }
        }
        catch (error) {
            return rpcError(error);
        }
    }, { authority: 'loopback' });
    return () => { void handle(); };
}
