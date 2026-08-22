/**
 * Stable element references bound to an observation.
 *
 * A raw `elementIndex` is not a stable cross-platform identifier because the
 * accessibility tree can change at any time. We reserve an `ElementRef` that
 * binds a platform element id to the observation and its tree checksum so the
 * provider can verify the element is still the same one that was observed.
 * Windows continues to expose `elementIndex` as a compatibility field.
 * @module
 */

import type { ElementId } from './identity.ts'

/** A validated reference to an element captured in an observation. */
export interface ElementRef {
  /** Platform element id (Windows: opaque; macOS/Linux: AT-SPI/AX path). */
  elementId: ElementId
  /** The observation this ref was captured under. */
  observationId: string
  /** UI-tree checksum at observation time. */
  checksum: string
  /** Legacy Windows UIA index, kept for back-compat. */
  elementIndex?: number
}

/** True when every required field of an ElementRef is populated. */
export function isElementRef(ref: unknown): ref is ElementRef {
  if (ref === null || typeof ref !== 'object') return false
  const r = ref as Record<string, unknown>
  return (
    typeof r.elementId === 'string' &&
    typeof r.observationId === 'string' &&
    typeof r.checksum === 'string'
  )
}
