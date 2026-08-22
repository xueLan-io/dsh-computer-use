/**
 * Apple HID virtual key codes used by CGEventCreateKeyboardEvent.
 *
 * These are the macOS "virtual keycodes" (not Windows VK codes). The names are
 * the same tokens accepted by the computer_press_key tool.
 * @module
 */

export const APPLE_KEY_CODES: Record<string, number> = {
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, escape: 53, esc: 53,
  capslock: 57, command: 55, shift: 56, ctrl: 59, control: 59, alt: 58, option: 58,
  rightshift: 60, rightctrl: 62, rightalt: 61,
  up: 126, down: 125, left: 123, right: 124,
  home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98,
  f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
}

/** ASCII -> virtual keycode for simple printable keys (lowercase layout). */
export const ASCII_TO_KEYCODE: Record<string, number> = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9,
  b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17, '1': 18, '2': 19, '3': 20,
  '4': 21, '6': 22, '5': 23, '=': 24, '9': 25, '7': 26, '-': 27, '8': 28,
  '0': 29, ']': 30, o: 31, u: 32, '[': 33, i: 34, p: 35, l: 37, j: 38,
  "'": 39, k: 40, ';': 41, '\\': 42, ',': 43, '/': 44, n: 45, m: 46,
  '.': 47, '`': 50,
}

/** Resolve a key name to a macOS virtual keycode when possible. */
export function resolveKeyCode(key: string): number | undefined {
  const lower = key.toLowerCase()
  if (lower in APPLE_KEY_CODES) return APPLE_KEY_CODES[lower]
  if (lower in ASCII_TO_KEYCODE) return ASCII_TO_KEYCODE[lower]
  return undefined
}
