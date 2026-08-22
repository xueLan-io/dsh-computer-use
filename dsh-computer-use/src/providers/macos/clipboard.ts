/**
 * macOS clipboard snapshot support.
 *
 * NSPasteboard does not have a snapshot mode like Windows OLE IDataObject.
 * The provider stores each pasteboard type's serialized contents and restores
 * them by clearing and rewriting the general pasteboard.
 *
 * The actual NSPasteboard calls are performed by the native addon; this module
 * defines the data contract and the JS-side size guards.
 * @module
 */

export interface ClipboardSnapshot {
  changeCount: number
  types: string[]
  contents: Map<string, ArrayBuffer>
  fileUrls?: string[]
}

/** Maximum bytes kept per pasteboard type, matching the plan's 10MB guard. */
export const CLIPBOARD_SNAPSHOT_LIMIT = 10 * 1024 * 1024

/** Validate a snapshot stays within the configured memory budget. */
export function validateSnapshotSize(snapshot: ClipboardSnapshot): boolean {
  let total = 0
  for (const data of snapshot.contents.values()) total += data.byteLength
  return total <= CLIPBOARD_SNAPSHOT_LIMIT
}

/**
 * Read the current pasteboard into a snapshot.
 *
 * The real implementation lives in the native addon (`saveClipboard()`); this
 * wrapper returns null on platforms without the addon.
 */
export async function saveClipboard(): Promise<ClipboardSnapshot | null> {
  if (process.platform !== 'darwin') return null
  // TODO(macos-native): call native saveClipboard and deserialize the snapshot.
  return null
}

/** Restore a previously captured snapshot. */
export async function restoreClipboard(snapshot: ClipboardSnapshot): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  // TODO(macos-native): call native restoreClipboard(snapshot).
  return false
}
