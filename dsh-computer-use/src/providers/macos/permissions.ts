/**
 * macOS TCC permission detection.
 *
 * The actual TCC checks require native APIs (AXIsProcessTrusted /
 * CGPreflightScreenCaptureAccess). The function below is the provider-facing
 * contract; the real implementation runs only on macOS.
 * @module
 */

export type TccState = 'granted' | 'denied' | 'unknown'

export interface MacosPermissionStatus {
  accessibility: TccState
  screenRecording: TccState
  inputMonitoring: TccState
}

export const PERMISSION_URLS = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
} as const

/**
 * Return the current TCC permission status.
 *
 * On non-darwin platforms this always returns `unknown` (the provider cannot
 * be used there anyway). The macOS-native implementation should override this
 * with real AX/ScreenCapture checks.
 */
export function getPermissionStatus(): MacosPermissionStatus {
  if (process.platform !== 'darwin') {
    return { accessibility: 'unknown', screenRecording: 'unknown', inputMonitoring: 'unknown' }
  }
  // TODO(macos): call native permission checks and return real states.
  return { accessibility: 'unknown', screenRecording: 'unknown', inputMonitoring: 'unknown' }
}

/** Build a human-readable permission guidance message. */
export function permissionGuidance(status: MacosPermissionStatus): string[] {
  const messages: string[] = []
  if (status.accessibility !== 'granted') {
    messages.push(`Accessibility permission is missing: ${PERMISSION_URLS.accessibility}`)
  }
  if (status.screenRecording !== 'granted') {
    messages.push(`Screen Recording permission is missing: ${PERMISSION_URLS.screenRecording}`)
  }
  if (status.inputMonitoring !== 'granted') {
    messages.push(`Input Monitoring permission may be needed: ${PERMISSION_URLS.inputMonitoring}`)
  }
  return messages
}
