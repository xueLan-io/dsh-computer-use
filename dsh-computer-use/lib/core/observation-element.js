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
/** True when every required field of an ElementRef is populated. */
export function isElementRef(ref) {
    if (ref === null || typeof ref !== 'object')
        return false;
    const r = ref;
    return (typeof r.elementId === 'string' &&
        typeof r.observationId === 'string' &&
        typeof r.checksum === 'string');
}
