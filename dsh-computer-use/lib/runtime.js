import * as native from 'dsh-computer-use-native';
export class ComputerUseError extends Error {
    code;
    recovery;
    constructor(code, message, recovery = 'NONE') {
        super(message);
        this.name = 'ComputerUseError';
        this.code = code;
        this.recovery = recovery;
    }
    toJSON() {
        return { ok: false, code: this.code, recovery: this.recovery, message: this.message };
    }
}
const observations = new Map();
const protectedWindows = new Map();
// Observations stay valid for 3 minutes: a real user action takes seconds to
// reason about, and the previous 30s TTL plus strict rect equality forced the
// model into an observe->timeout->re-observe death spiral on busy windows.
const OBSERVATION_TTL = 180_000;
// A window that moved is still the same UI; only a size change invalidates
// the screenshot geometry. Actions are window-relative, so they auto-remap
// through the CURRENT rect.
const RECT_TOLERANCE = 8;
const PROTECTED_WINDOWS_CAP = 512;
const TREE_MAX_NODES = 2000;
const TREE_MAX_DEPTH = 32;
function identity(windowId) {
    try {
        return native.getWindow(windowId);
    }
    catch {
        throw new ComputerUseError('WINDOW_NOT_FOUND', `窗口 ${windowId} 不存在`, 'REQUIRES_REFRESH');
    }
}
function brandProtected(window) {
    const title = window.title.toLowerCase();
    const cls = window.className.toLowerCase();
    // Match process-path SEGMENTS rather than substrings so a program living in
    // a folder like "dsh-stuff" or "mysandsh" is not mistaken for DSH itself.
    const segments = window.processPath.toLowerCase().split(/[\\/]/);
    const dshProcess = segments.some((s) => s === 'dsh' || s === 'deepseek' || s === 'harness' ||
        s.startsWith('dsh-') || s.startsWith('dsh_') ||
        s.startsWith('deepseek-') || s.startsWith('deepseek_') ||
        s.startsWith('harness-') || s.startsWith('harness_'));
    const dshBrand = /deepseek|dsh harness|deepseek harness|deepseek-harness|^dsh$/.test(title);
    const dshClass = /\b(dsh|deepseek|harness)\b/.test(cls);
    return dshProcess || dshBrand || dshClass;
}
export function assertSafeWindow(windowId, action = 'control') {
    const window = identity(windowId);
    const known = protectedWindows.get(windowId);
    if (known || brandProtected(window)) {
        protectedWindows.set(windowId, {
            processId: window.processId,
            processPath: window.processPath,
            title: window.title,
            className: window.className,
        });
        while (protectedWindows.size > PROTECTED_WINDOWS_CAP)
            protectedWindows.delete(protectedWindows.keys().next().value);
        throw new ComputerUseError('PROTECTED_WINDOW', `禁止对受保护的 DSH 窗口执行 ${action}`, 'DENY');
    }
    return window;
}
export function listWindows() {
    return native.listWindows();
}
function activateNative(windowId) {
    if (!native.activateWindow(windowId))
        throw new ComputerUseError('NATIVE_ACTIVATE_FAILED', '目标窗口无法激活或不在屏幕上', 'RETRY');
    const current = identity(windowId);
    if (!current.foreground || !current.visible || current.minimized || !current.onScreen || !current.rect.width || !current.rect.height) {
        throw new ComputerUseError('NATIVE_ACTIVATE_FAILED', '目标窗口未成为前台可见窗口', 'RETRY');
    }
    return current;
}
export function getWindow(id) {
    return identity(id);
}
export function createObservation(windowId, value) {
    const now = Date.now();
    const observationId = `obs_${windowId.toString(16)}_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    // Capture may restore a minimized target, so persist the post-capture identity.
    const item = { ...value, ...identity(windowId), observationId, createdAt: now, expiresAt: now + OBSERVATION_TTL };
    observations.set(observationId, item);
    while (observations.size > 128)
        observations.delete(observations.keys().next().value);
    return item;
}
function sameIdentity(a, b) {
    return (a.windowId === b.windowId &&
        a.processId === b.processId &&
        a.processPath === b.processPath &&
        a.className === b.className);
}
export function validateObservation(observationId, windowId, action) {
    const old = observations.get(observationId);
    if (!old)
        throw new ComputerUseError('INVALID_OBSERVATION', 'observationId 无效，请重新观察', 'REQUIRES_REFRESH');
    if (old.windowId !== windowId)
        throw new ComputerUseError('OBSERVATION_WINDOW_MISMATCH', 'observationId 不属于目标窗口，请重新观察', 'REQUIRES_REFRESH');
    if (old.expiresAt <= Date.now()) {
        observations.delete(observationId);
        throw new ComputerUseError('OBSOLETE_OBSERVATION', 'observation 已过期，请重新获取窗口状态', 'REQUIRES_REFRESH');
    }
    const current = identity(windowId);
    const sizeMoved = Math.abs(current.rect.width - old.rect.width) > RECT_TOLERANCE ||
        Math.abs(current.rect.height - old.rect.height) > RECT_TOLERANCE;
    if (!sameIdentity(current, old) || sizeMoved) {
        throw new ComputerUseError('WINDOW_IDENTITY_CHANGED', `窗口状态已变化，不能执行 ${action}`, 'REQUIRES_REFRESH');
    }
    if (brandProtected(current))
        throw new ComputerUseError('PROTECTED_WINDOW', '禁止操作受保护的 DSH 窗口', 'DENY');
    return old;
}
export function point(window, x, y, observation, coordinateSpace = 'auto') {
    if (coordinateSpace === 'screen') {
        if (!Number.isInteger(x) || !Number.isInteger(y) ||
            x < window.rect.left || y < window.rect.top ||
            x >= window.rect.right || y >= window.rect.bottom) {
            throw new ComputerUseError('COORDINATE_OUT_OF_BOUNDS', `屏幕坐标 (${x}, ${y}) 不在目标窗口范围内`, 'REQUIRES_REFRESH');
        }
        return { x, y };
    }
    // auto / screenshot / window are all window-relative: the screenshot IS the
    // window rect, and coordinates map through the CURRENT rect so a window that
    // merely moved still receives the same relative click.
    if (!Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 ||
        x >= window.rect.width || y >= window.rect.height) {
        throw new ComputerUseError('COORDINATE_OUT_OF_BOUNDS', `坐标 (${x}, ${y}) 超出窗口范围 ${window.rect.width}x${window.rect.height}`, 'REQUIRES_REFRESH');
    }
    return { x: window.rect.left + x, y: window.rect.top + y };
}
function elementPoint(windowId, index) {
    let rect;
    try {
        rect = native.elementRect(windowId, index, TREE_MAX_NODES, TREE_MAX_DEPTH);
    }
    catch {
        throw new ComputerUseError('ELEMENT_NOT_FOUND', `元素索引 ${index} 已失效，请重新观察`, 'REQUIRES_REFRESH');
    }
    return { x: Math.floor((rect.left + rect.right) / 2), y: Math.floor((rect.top + rect.bottom) / 2) };
}
const overlay = { handle: 0, timer: undefined, pulseTimer: undefined, visible: false, config: { overlayEnabled: false, overlayIdleMs: 10_000, overlayText: 'DSH 正在操作电脑', overlayColor: '#00D9FF' } };
export function configureOverlay(config) {
    if (overlay.config.overlayEnabled && !config.overlayEnabled)
        hideOverlayNow();
    overlay.config = config;
}
function hideOverlayNow(fade = false) {
    if (overlay.timer) {
        clearTimeout(overlay.timer);
        overlay.timer = undefined;
    }
    if (overlay.pulseTimer) {
        clearInterval(overlay.pulseTimer);
        overlay.pulseTimer = undefined;
    }
    if (overlay.visible && overlay.handle) {
        try {
            native.overlayHide(overlay.handle, fade);
        }
        catch { /* best effort */ }
        overlay.visible = false;
    }
}
// Blocks the main thread (needed: a real dwell before the click). The move
// already animated up to 420ms; the extra pause makes the landing readable.
function syncSleep(ms) {
    if (ms <= 0)
        return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function syncOverlay(windowId = 0) {
    if (!overlay.config.overlayEnabled)
        return;
    if (!overlay.handle) {
        try {
            overlay.handle = native.overlayCreate();
        }
        catch {
            return;
        }
    }
    try {
        if (native.overlayShow(overlay.handle, windowId, overlay.config.overlayText)) {
            overlay.visible = true;
            if (overlay.timer)
                clearTimeout(overlay.timer);
            if (overlay.pulseTimer)
                clearInterval(overlay.pulseTimer);
            overlay.pulseTimer = setInterval(refreshOverlay, 100);
            overlay.timer = setTimeout(() => hideOverlayNow(true), Math.max(1_000, overlay.config.overlayIdleMs));
        }
    }
    catch { /* overlay is best effort */ }
}
// Shows the feedback overlay before a tool even asks for approval, so the
// user sees "DSH 正在操作电脑" while the approval dialog is on screen.
export function showOverlay(windowId = 0) {
    syncOverlay(windowId);
}
function refreshOverlay() {
    if (!overlay.visible || !overlay.handle)
        return;
    try {
        native.overlayRefresh(overlay.handle);
    }
    catch { /* overlay is best effort */ }
}
function invokeBackgroundClick(windowId, p, count) {
    // Keep the visual cursor honest even when Windows refuses foreground access.
    // The native provider only invokes a UIA element at this observed point.
    if (!native.moveCursor(p.x, p.y))
        return false;
    refreshOverlay();
    // Deliberately NOT hiding here: the UIA invoke happens in the background and
    // the overlay must keep showing so the user sees DSH is still in control.
    return native.invokeAtPoint(windowId, p.x, p.y, count);
}
// ---------- actions ----------
export function capture(windowId, path) {
    assertSafeWindow(windowId, '截图');
    const wasVisible = overlay.visible;
    hideOverlayNow();
    try {
        const current = activateNative(windowId);
        // Capture only the target window rect: full-screen screenshots leak other
        // windows (and the DSH chat bubble) into the vision model's context.
        if (!native.captureWindow(windowId, path))
            throw new ComputerUseError('NATIVE_CAPTURE_FAILED', '窗口截图失败', 'RETRY');
        return { path, rect: current.rect };
    }
    finally {
        if (wasVisible)
            syncOverlay(windowId);
    }
}
export function activate(windowId) {
    assertSafeWindow(windowId, '激活');
    const current = activateNative(windowId);
    syncOverlay(windowId);
    return { activated: true, windowId, foreground: current.foreground, rect: current.rect };
}
export function click(windowId, x, y, button, count, observation, coordinateSpace = 'auto', options = {}) {
    const w = assertSafeWindow(windowId, 'click');
    if (!['left', 'middle', 'right'].includes(button) || !Number.isFinite(count)) {
        throw new ComputerUseError('INVALID_CLICK', 'Invalid click arguments', 'DENY');
    }
    const clicks = Math.max(1, Math.min(3, count));
    let px = x;
    let py = y;
    let space = coordinateSpace;
    if (options.elementIndex !== undefined) {
        const center = elementPoint(windowId, options.elementIndex);
        try {
            if (native.elementClick(windowId, options.elementIndex, clicks, TREE_MAX_NODES, TREE_MAX_DEPTH)) {
                return { clicked: true, elementIndex: options.elementIndex, method: 'uia-element' };
            }
        }
        catch { /* pattern invoke unavailable; fall through to a pixel click */ }
        px = center.x;
        py = center.y;
        space = 'screen';
    }
    const p = point(w, px, py, observation, space);
    if (options.clickMethod === 'post') {
        if (!native.postClick(windowId, p.x, p.y, button, clicks))
            throw new ComputerUseError('NATIVE_INPUT_FAILED', 'PostMessage click failed', 'RETRY');
        return { clicked: true, x, y, screenX: p.x, screenY: p.y, method: 'post' };
    }
    try {
        activateNative(windowId);
    }
    catch (error) {
        if (!(error instanceof ComputerUseError) || error.code !== 'NATIVE_ACTIVATE_FAILED')
            throw error;
        syncOverlay(windowId);
        if (button === 'left' && invokeBackgroundClick(windowId, p, clicks)) {
            return { clicked: true, x, y, screenX: p.x, screenY: p.y, method: 'uia-background-invoke' };
        }
        throw error;
    }
    syncOverlay(windowId);
    if (!native.moveCursor(p.x, p.y))
        throw new ComputerUseError('NATIVE_INPUT_FAILED', 'Mouse movement failed', 'RETRY');
    refreshOverlay();
    syncSleep(150); // dwell on the landing point so the action reads as deliberate
    if (!native.click(button, clicks)) {
        if (button === 'left' && invokeBackgroundClick(windowId, p, clicks)) {
            return { clicked: true, x, y, screenX: p.x, screenY: p.y, method: 'uia-background-invoke' };
        }
        throw new ComputerUseError('NATIVE_INPUT_FAILED', 'Mouse click failed', 'RETRY');
    }
    return { clicked: true, x, y, screenX: p.x, screenY: p.y, method: 'node-native' };
}
export function typeText(windowId, value) {
    assertSafeWindow(windowId, '输入');
    if (value.length > 20_000)
        throw new ComputerUseError('INPUT_TOO_LARGE', '单次输入最多 20000 个字符', 'DENY');
    activateNative(windowId);
    syncOverlay(windowId);
    // Paste-first: SendInput UNICODE events are silently dropped by controls
    // that ignore them (e.g. the File Explorer search box), yet SendInput still
    // reports success. Clipboard paste is accepted by those controls, so it is
    // the primary path and UNICODE injection is the fallback.
    const previous = native.getClipboardText();
    if (native.setClipboardText(value)) {
        const pasted = native.paste();
        // The Ctrl+V keystrokes are processed asynchronously; give the target app
        // time to read the clipboard before restoring the previous content.
        syncSleep(300);
        try {
            native.setClipboardText(previous);
        }
        catch { /* best effort restore */ }
        if (pasted)
            return { typed: true, chars: value.length, method: 'clipboard-paste' };
    }
    // Fallback: direct Unicode injection for apps where clipboard paste fails.
    if (native.typeText(value))
        return { typed: true, chars: value.length, method: 'sendinput-unicode' };
    throw new ComputerUseError('NATIVE_INPUT_FAILED', '文本输入失败', 'RETRY');
}
const keyCodes = {
    enter: 13, return: 13, tab: 9, escape: 27, esc: 27, space: 32,
    backspace: 8, delete: 46, insert: 45, home: 36, end: 35, pageup: 33, pagedown: 34,
    up: 38, down: 40, left: 37, right: 39,
    ctrl: 17, control: 17, shift: 16, alt: 18,
    control_l: 0xA2, control_r: 0xA3, shift_l: 0xA0, shift_r: 0xA1, alt_l: 0xA4, alt_r: 0xA5,
    capslock: 20, numlock: 144, scrolllock: 145, printscreen: 44, pause: 19,
    // Punctuation MUST be explicit: charCodeOf('.')=46 is VK_DELETE, so a
    // naive ASCII fallback would turn '.' into Delete.
    '.': 0xBE, ',': 0xBC, '/': 0xBF, '\\': 0xDC, ';': 0xBA, "'": 0xDE,
    '[': 0xDB, ']': 0xDD, '-': 0xBD, '=': 0xBB, '`': 0xC0,
};
for (let i = 0; i <= 9; i++) {
    keyCodes[`kp_${i}`] = 0x60 + i;
    keyCodes[`numpad_${i}`] = 0x60 + i;
}
keyCodes.numpad_add = 0x6B;
keyCodes.numpad_subtract = 0x6D;
keyCodes.numpad_multiply = 0x6A;
keyCodes.numpad_divide = 0x6F;
keyCodes.numpad_decimal = 0x6E;
for (let i = 1; i <= 24; i++)
    keyCodes[`f${i}`] = 0x70 + (i - 1);
export function pressKey(windowId, value) {
    assertSafeWindow(windowId, '按键');
    const tokens = value.split('+').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!tokens.length || tokens.some((x) => ['win', 'windows', 'meta', 'cmd', 'command', 'super', 'os'].includes(x))) {
        throw new ComputerUseError('FORBIDDEN_KEY', 'Windows/Meta 快捷键不允许使用', 'DENY');
    }
    const main = tokens.pop();
    const mainCode = keyCodes[main] ?? (main.length === 1 && /[a-z0-9]/i.test(main) ? main.toUpperCase().charCodeAt(0) : undefined);
    if (mainCode === undefined)
        throw new ComputerUseError('UNSUPPORTED_KEY', `不支持的按键: ${main}`, 'DENY');
    const mods = tokens.map((x) => keyCodes[x]);
    if (mods.some((code) => code === undefined))
        throw new ComputerUseError('UNSUPPORTED_MODIFIER', '不支持的修饰键', 'DENY');
    activateNative(windowId);
    syncOverlay(windowId);
    const held = [];
    let mainHeld = false;
    try {
        for (const code of mods) {
            if (!native.pressKey(code, true))
                throw new ComputerUseError('NATIVE_INPUT_FAILED', '修饰键按下失败', 'RETRY');
            held.push(code);
        }
        if (!native.pressKey(mainCode, true)) {
            throw new ComputerUseError('NATIVE_INPUT_FAILED', '按键发送失败', 'RETRY');
        }
        mainHeld = true;
        if (!native.pressKey(mainCode, false))
            throw new ComputerUseError('NATIVE_INPUT_FAILED', '按键释放失败', 'RETRY');
        mainHeld = false;
    }
    finally {
        if (mainHeld)
            native.pressKey(mainCode, false);
        for (const code of held.reverse())
            native.pressKey(code, false);
    }
    return { pressed: true, key: value, modifiers: mods.length };
}
export function scroll(windowId, x, y, scrollX, scrollY, observation, coordinateSpace = 'auto', options = {}) {
    const w = assertSafeWindow(windowId, '滚动');
    if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY))
        throw new ComputerUseError('INVALID_SCROLL', '滚动值必须是有限数字', 'DENY');
    const dx = Math.max(-20_000, Math.min(20_000, scrollX));
    const dy = Math.max(-20_000, Math.min(20_000, scrollY));
    let px = x;
    let py = y;
    let space = coordinateSpace;
    if (options.elementIndex !== undefined) {
        const center = elementPoint(windowId, options.elementIndex);
        px = center.x;
        py = center.y;
        space = 'screen';
    }
    const p = point(w, px, py, observation, space);
    if (!dx && !dy)
        return { scrolled: true, x, y, scrollX: 0, scrollY: 0, method: 'none' };
    try {
        activateNative(windowId);
    }
    catch (error) {
        if (!(error instanceof ComputerUseError) || error.code !== 'NATIVE_ACTIVATE_FAILED')
            throw error;
        syncOverlay(windowId);
        // Background wheel: WM_MOUSEWHEEL / WM_MOUSEHWHEEL carry a single delta, so
        // both axes require two posts. Post each non-zero axis independently.
        const postedX = dx === 0 || native.postWheel(windowId, p.x, p.y, dx, true);
        const postedY = dy === 0 || native.postWheel(windowId, p.x, p.y, dy, false);
        if (postedX && postedY) {
            return { scrolled: true, x, y, scrollX: dx, scrollY: dy, method: 'post-wheel' };
        }
        throw error;
    }
    syncOverlay(windowId);
    if (!native.moveCursor(p.x, p.y))
        throw new ComputerUseError('NATIVE_INPUT_FAILED', '鼠标移动失败', 'RETRY');
    refreshOverlay();
    if (!native.scroll(p.x, p.y, dx, dy))
        throw new ComputerUseError('NATIVE_INPUT_FAILED', '鼠标滚轮输入失败', 'RETRY');
    return { scrolled: true, x, y, scrollX: dx, scrollY: dy, method: 'SendInput-wheel' };
}
export function drag(windowId, fromX, fromY, toX, toY, observation, coordinateSpace = 'auto', options = {}) {
    const w = assertSafeWindow(windowId, '拖动');
    const a = options.fromElementIndex !== undefined ? elementPoint(windowId, options.fromElementIndex) : point(w, fromX, fromY, observation, coordinateSpace);
    const b = options.toElementIndex !== undefined ? elementPoint(windowId, options.toElementIndex) : point(w, toX, toY, observation, coordinateSpace);
    activateNative(windowId);
    syncOverlay(windowId);
    if (!native.drag(a.x, a.y, b.x, b.y))
        throw new ComputerUseError('NATIVE_INPUT_FAILED', '鼠标拖动失败', 'RETRY');
    refreshOverlay();
    return { dragged: true, from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, method: 'node-native' };
}
export function accessibilityTree(windowId) {
    assertSafeWindow(windowId, 'UIA 读取');
    return native.accessibilityTree(windowId, TREE_MAX_NODES, TREE_MAX_DEPTH);
}
export function disposeRuntime() {
    observations.clear();
    hideOverlayNow();
    if (overlay.handle) {
        try {
            native.overlayDestroy(overlay.handle);
        }
        catch { /* best effort */ }
        overlay.handle = 0;
    }
    // Safety net: if the overlay was force-hidden (or the engine is shutting
    // down) without a normal hide, make sure the system cursor is the default.
    try {
        native.restoreSystemCursors();
    }
    catch { /* best effort */ }
}
export function stopControlSession() {
    disposeRuntime();
}
