/**
 * Brand protection: never allow DSH to control its own (or DeepSeek/Harness)
 * windows. Pure logic extracted so it can be unit-tested without native deps.
 * @module
 */
/**
 * True when a window belongs to DSH / DeepSeek / Harness.
 *
 * Process-path segments are matched (not substrings) so a program living in a
 * folder like `dsh-stuff` or `mysandsh` is not mistaken for DSH itself.
 */
export function brandProtected(window) {
    const title = window.title.toLowerCase();
    const cls = window.className.toLowerCase();
    const segments = window.processPath.toLowerCase().split(/[\\/]/);
    const dshProcess = segments.some((s) => s === 'dsh' || s === 'deepseek' || s === 'harness' ||
        s.startsWith('dsh-') || s.startsWith('dsh_') ||
        s.startsWith('deepseek-') || s.startsWith('deepseek_') ||
        s.startsWith('harness-') || s.startsWith('harness_'));
    const dshBrand = /deepseek|dsh harness|deepseek harness|deepseek-harness|^dsh$/.test(title);
    const dshClass = /\b(dsh|deepseek|harness)\b/.test(cls);
    return dshProcess || dshBrand || dshClass;
}
