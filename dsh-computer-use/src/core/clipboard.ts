/**
 * Clipboard save/restore policy.
 *
 * Providers implement raw save/restore; this module adds the common
 * "save before paste, restore after paste" wrapper used by typeText.
 * @module
 */

import type { DesktopProvider } from './types.ts'

export interface Clipboards {
  save(): Promise<boolean>
  restore(): Promise<boolean>
  setText(text: string): Promise<boolean>
  paste(): Promise<boolean>
}

/** Wrap a provider's clipboard primitives. */
export function providerClipboards(provider: DesktopProvider): Clipboards {
  return {
    save: () => provider.saveClipboard(),
    restore: () => provider.restoreClipboard(),
    setText: () => Promise.resolve(false),
    paste: () => Promise.resolve(false),
  }
}

/**
 * Run `fn` with a saved clipboard and restore afterwards.
 *
 * The generic `Clipboards` interface lets a host supply setText/paste; when
 * not available the caller falls back to direct injection.
 */
export async function withClipboardRestore<T>(clipboards: Clipboards, fn: () => Promise<T>): Promise<T> {
  const saved = await clipboards.save()
  try {
    return await fn()
  } finally {
    if (saved) await clipboards.restore()
  }
}
