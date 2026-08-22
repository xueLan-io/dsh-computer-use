/**
 * macOS browser launch adaptations.
 *
 * `--new-window` is not universal on macOS; Safari uses `--args`, while
 * Chromium/Firefox use their own new-window flags.
 * @module
 */

/** Adjust launch args for a known browser on macOS. */
export function adaptBrowserLaunchArgs(appName: string, args: string[]): { args: string[]; forcedNewWindow: boolean } {
  const lower = appName.toLowerCase()
  const result = [...args]
  let forcedNewWindow = false
  if (lower.includes('safari')) {
    // Safari does not support --new-window; pass through as --args.
    if (!result.includes('--args')) result.unshift('--args')
  } else if (lower.includes('chrome') || lower.includes('chromium') || lower.includes('edge') || lower.includes('brave')) {
    if (!result.includes('--new-window')) {
      result.unshift('--new-window')
      forcedNewWindow = true
    }
  } else if (lower.includes('firefox')) {
    if (!result.some((a) => a === '-new-window')) {
      result.unshift('-new-window')
      forcedNewWindow = true
    }
  }
  return { args: result, forcedNewWindow }
}
