/**
 * Clipboard save/restore policy.
 *
 * Providers implement raw save/restore; this module adds the common
 * "save before paste, restore after paste" wrapper used by typeText.
 * @module
 */
import type { DesktopProvider } from './types.ts';
export interface Clipboards {
    save(): Promise<boolean>;
    restore(): Promise<boolean>;
    setText(text: string): Promise<boolean>;
    paste(): Promise<boolean>;
}
/** Wrap a provider's clipboard primitives. */
export declare function providerClipboards(provider: DesktopProvider): Clipboards;
/**
 * Run `fn` with a saved clipboard and restore afterwards.
 *
 * The generic `Clipboards` interface lets a host supply setText/paste; when
 * not available the caller falls back to direct injection.
 */
export declare function withClipboardRestore<T>(clipboards: Clipboards, fn: () => Promise<T>): Promise<T>;
