#!/usr/bin/env python3
"""DSH Computer Use helper.

A small Windows automation sidecar, mirroring the architecture of Codex
Computer Use: the DSH plugin (Node.js) talks JSON-RPC over stdin/stdout to
this process, and this process talks to the Windows desktop through UI
Automation + SendInput + mss screenshots.

Wire protocol (one JSON object per line):

    {"id": 1, "method": "list_windows", "params": {}}
    {"id": 1, "ok": true, "result": {...}}
    {"id": 1, "ok": false, "error": "message"}

Only run on Windows.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path

import mss
import mss.tools
import uiautomation as auto

from overlay import OverlayManager, set_custom_cursor
from permission_widget import PermissionWidget

MAX_TREE_DEPTH = 24
MAX_TREE_NODES = 400

# Global overlay + idle timer for the "DSH is controlling your computer" UI.
_overlay = OverlayManager()
_overlay_timer: threading.Timer | None = None
_overlay_lock = threading.Lock()
_OVERLAY_IDLE_MS_DEFAULT = 10_000

# Persistent "allow DSH to control" permission widget.
_permission_widget: PermissionWidget | None = None
_permission_lock = threading.Lock()


# ---------------------------------------------------------------- utilities

def window_id(control: auto.Control) -> int:
    """Return the Win32 HWND of a UI Automation control as an int."""
    return int(control.NativeWindowHandle or 0)


def is_real_window(control: auto.Control) -> bool:
    """Filter out invisible/zero-sized/desktop pseudo windows."""
    try:
        if window_id(control) == 0:
            return False
        rect = control.BoundingRectangle
        if rect is None or rect.width() <= 0 or rect.height() <= 0:
            return False
        # UIAutomation's IsWindowVisible is more reliable than the Python prop.
        return bool(auto.IsWindowVisible(window_id(control)))
    except Exception:
        return False


def control_by_handle(handle: int) -> auto.Control:
    return auto.ControlFromHandle(handle)


def window_rect(handle: int) -> dict:
    """Return {left, top, width, height, right, bottom} for a window."""
    try:
        c = control_by_handle(handle)
        r = c.BoundingRectangle
        return {
            "left": int(r.left),
            "top": int(r.top),
            "width": int(r.width()),
            "height": int(r.height()),
            "right": int(r.right),
            "bottom": int(r.bottom),
        }
    except Exception:
        return {}


def window_title(handle: int) -> str:
    try:
        c = control_by_handle(handle)
        return c.Name or ""
    except Exception:
        return ""


DSH_WINDOW_BLOCKED = (
    "安全限制：禁止直接操作 DSH 聊天窗口（DeepSeek Harness），"
    "否则会覆盖/打断正在进行的对话。请先打开一个全新的浏览器窗口/标签页"
    "（例如 computer_launch_app 启动 Edge/Chrome/Firefox，插件会自动加 --new-window），"
    "再在那个新页面里搜索或输入网址。"
)

# 已确认是 DSH 聊天窗口的 HWND 记忆：标题匹配一次后永久拦截，
# 防止用户切到其他标签页导致窗口标题变化后绕过检测。
_dsh_window_handles: set[int] = set()


def _is_dsh_window(handle: int) -> bool:
    """True when the target window is (or hosts) the DSH chat window."""
    if handle in _dsh_window_handles:
        return True
    try:
        title = (window_title(handle) or "").lower()
        c = control_by_handle(handle)
        cls = (c.ClassName or "").lower()
        # 标题里出现 DSH 品牌名（Firefox 的窗口标题会拼上网页标题）。
        if "deepseek harness" in title or "deepseek-harness" in title:
            _dsh_window_handles.add(handle)
            return True
        # 浏览器窗口：标题里含 DSH 品牌关键词才视为 DSH 宿主。注意不能匹配
        # 裸的 "dsh" 子串 —— 用户自己的仓库名/项目名（如 "dsh-computer-use"）
        # 会误触发拦截；DSH 的实际标题都含 DeepSeek/Harness 品牌词。
        browser_cls = (
            "mozilla" in cls
            or "chrome_widget" in cls
            or "applicationframe" in cls
            or "cef" in cls
        )
        if browser_cls and any(k in title for k in ("dsh harness", "dsh-harness", "harness", "deepseek")):
            _dsh_window_handles.add(handle)
            return True
        # 标题恰好是 DSH 自身。
        if title.strip() in ("dsh", "deepseek harness"):
            _dsh_window_handles.add(handle)
            return True
    except Exception:
        pass
    return False


def _block_dsh_interaction(handle: int) -> None:
    if _is_dsh_window(handle):
        raise RuntimeError(DSH_WINDOW_BLOCKED)


def _dpi_scale(handle: int) -> float:
    """Per-window DPI scale factor (1.0 = 100%).

    UIA bounding rectangles are in physical pixels, while SetCursorPos and
    mouse/keyboard input use logical pixels. On scaled displays (e.g. 150%)
    coordinates must be divided by this factor or every click lands off-target.
    """
    try:
        import ctypes

        dpi = ctypes.windll.user32.GetDpiForWindow(ctypes.c_void_p(handle))
        if dpi > 0:
            return dpi / 96.0
    except Exception:
        pass
    return 1.0


def _rect_to_screen(handle: int, x: int, y: int):
    """Convert window-relative (x, y) to screen coordinates (logical pixels)."""
    r = window_rect(handle)
    scale = _dpi_scale(handle)
    return int((r["left"] + x) / scale), int((r["top"] + y) / scale)


def _check_in_window(handle: int, x: int, y: int) -> None:
    """Reject coordinates outside the window's bounds (would click another window)."""
    r = window_rect(handle)
    if not r or r["width"] <= 0 or r["height"] <= 0:
        raise RuntimeError("window has no usable bounds")
    if not (0 <= x < r["width"] and 0 <= y < r["height"]):
        raise RuntimeError(f"坐标 ({x}, {y}) 超出窗口范围 {r['width']}x{r['height']}")


# ------------------------------------------------------------ Win32 messages
# Codex-style "app_post" input: drive the target window through posted window
# messages instead of moving the real cursor / stealing the foreground focus.
# Posted clicks/keys/chars work on background windows, are not swallowed by
# the "first click only activates" rule, and are immune to DPI coordinate
# mismatches (ScreenToClient works entirely in the logical domain).

import ctypes

_WM_MOUSEMOVE = 0x0200
_WM_LBUTTONDOWN = 0x0201
_WM_LBUTTONUP = 0x0202
_WM_RBUTTONDOWN = 0x0204
_WM_RBUTTONUP = 0x0205
_WM_MBUTTONDOWN = 0x0207
_WM_MBUTTONUP = 0x0208
_WM_MOUSEWHEEL = 0x020A
_WM_MOUSEHWHEEL = 0x020E
_WM_CHAR = 0x0102
_WM_KEYDOWN = 0x0100
_WM_KEYUP = 0x0101

_user32 = ctypes.windll.user32


def _post(hwnd: int, msg: int, wparam: int, lparam: int) -> None:
    _user32.PostMessageW(ctypes.c_void_p(hwnd), msg, wparam, lparam)


def _lparam(x: int, y: int) -> int:
    return ((y & 0xFFFF) << 16) | (x & 0xFFFF)


def _client_point(hwnd: int, screen_x: int, screen_y: int) -> tuple[int, int]:
    """Convert logical screen coords to client coords (same logical domain)."""

    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    pt = POINT(int(screen_x), int(screen_y))
    _user32.ScreenToClient(ctypes.c_void_p(hwnd), ctypes.byref(pt))
    return pt.x, pt.y


def post_click(
    hwnd: int, screen_x: int, screen_y: int, button: str = "left", count: int = 1
) -> None:
    """Posted-message click: WM_MOUSEMOVE + DOWN + UP at client coords.

    Works on background windows without moving the real cursor.
    """
    cx, cy = _client_point(hwnd, screen_x, screen_y)
    lp = _lparam(cx, cy)
    if button in ("right", "r"):
        down, up, flag = _WM_RBUTTONDOWN, _WM_RBUTTONUP, 0x0002
    elif button in ("middle", "m"):
        down, up, flag = _WM_MBUTTONDOWN, _WM_MBUTTONUP, 0x0010
    else:
        down, up, flag = _WM_LBUTTONDOWN, _WM_LBUTTONUP, 0x0001
    for _ in range(max(1, count)):
        _post(hwnd, _WM_MOUSEMOVE, 0, lp)
        _post(hwnd, down, flag, lp)
        time.sleep(0.035)
        _post(hwnd, up, 0, lp)
        time.sleep(0.05)


def post_wheel(hwnd: int, screen_x: int, screen_y: int, delta: int, horizontal: bool = False) -> None:
    cx, cy = _client_point(hwnd, screen_x, screen_y)
    wp = (delta << 16) & 0xFFFFFFFF
    _post(hwnd, _WM_MOUSEHWHEEL if horizontal else _WM_MOUSEWHEEL, wp, _lparam(cx, cy))


def post_chars(hwnd: int, text: str) -> None:
    """Posted WM_CHAR per char — bypasses the IME, works on background windows."""
    for ch in text:
        _post(hwnd, _WM_CHAR, ord(ch), 0)
        time.sleep(0.008)


def post_key_message(hwnd: int, vk: int, down: bool) -> None:
    _post(hwnd, _WM_KEYDOWN if down else _WM_KEYUP, vk, 0)


def send_unicode(text: str) -> bool:
    """Type text via SendInput KEYEVENTF_UNICODE events.

    Unlike keybd_event VK presses, Unicode events are not routed through the
    IME, so Chinese/Japanese input works regardless of the active keyboard
    layout. Requires the target window to be in the foreground.
    """
    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", ctypes.c_ushort),
            ("wScan", ctypes.c_ushort),
            ("dwFlags", ctypes.c_ulong),
            ("time", ctypes.c_ulong),
            ("dwExtraInfo", ctypes.c_ulonglong),
        ]

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [
            ("dx", ctypes.c_long),
            ("dy", ctypes.c_long),
            ("mouseData", ctypes.c_ulong),
            ("dwFlags", ctypes.c_ulong),
            ("time", ctypes.c_ulong),
            ("dwExtraInfo", ctypes.c_ulonglong),
        ]

    class INPUTUNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", ctypes.c_ulong), ("u", INPUTUNION)]

    KEYEVENTF_UNICODE = 0x0004
    KEYEVENTF_KEYUP = 0x0002
    for ch in text:
        for down in (0, KEYEVENTF_KEYUP):
            ki = KEYBDINPUT(0, ord(ch), down | KEYEVENTF_UNICODE, 0, 0)
            inp = INPUT(1, INPUTUNION(ki=ki))
            sent = _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
            if sent != 1:
                return False
            time.sleep(0.01)
    return True


def take_screenshot(handle: int, output_path: str | None = None) -> str:
    """Capture the window's bounding rectangle and save a PNG.

    Returns the saved PNG path (or a temp path when output_path is None).
    """
    r = window_rect(handle)
    if not r or r["width"] <= 0 or r["height"] <= 0:
        raise RuntimeError("window has no usable bounds")

    if output_path is None:
        output_dir = Path(tempfile.gettempdir()) / "dsh-computer-use"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(output_dir / f"window-{handle}-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.png")
    else:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    monitor = {"left": r["left"], "top": r["top"], "width": r["width"], "height": r["height"]}
    with mss.mss() as sct:
        shot = sct.grab(monitor)
        mss.tools.to_png(shot.rgb, shot.size, output=output_path)
    return output_path


# ---------------------------------------------------------------- overlay

def _cancel_overlay_timer() -> None:
    global _overlay_timer
    with _overlay_lock:
        if _overlay_timer is not None:
            _overlay_timer.cancel()
            _overlay_timer = None


def _schedule_overlay_end(idle_ms: int) -> None:
    global _overlay_timer
    _cancel_overlay_timer()
    with _overlay_lock:
        _overlay_timer = threading.Timer(max(500, idle_ms) / 1000.0, overlay_end, args=({},))
        _overlay_timer.daemon = True
        _overlay_timer.start()


def overlay_begin(params: dict) -> dict:
    """Show the blue border/banner and swap the cursor, then auto-end after idle."""
    text = str(params.get("text", "DSH 正在控制你的电脑"))
    color = str(params.get("color", "#2563EB"))
    idle_ms = int(params.get("idleMs", _OVERLAY_IDLE_MS_DEFAULT))
    _overlay.show(text, color)
    set_custom_cursor(True)
    _schedule_overlay_end(idle_ms)
    return {"active": True, "idleMs": idle_ms}


def overlay_end(params: dict) -> dict:
    """Hide the overlay and restore the default cursor."""
    _cancel_overlay_timer()
    set_custom_cursor(False)
    _overlay.clear()
    return {"active": False}


# ------------------------------------------------------- permission widget

def permission_widget_show(params: dict) -> dict:
    """Show the small allow/deny checkbox beside the DSH chat window."""
    global _permission_widget
    permission_file = str(params.get("permissionFile", ""))
    if not permission_file:
        permission_file = str(Path(tempfile.gettempdir()) / "dsh-computer-use.permission.json")
    with _permission_lock:
        if _permission_widget is None:
            _permission_widget = PermissionWidget(permission_file)
        _permission_widget.start()
    return {"widget": True, "permissionFile": permission_file}


def permission_widget_hide(params: dict) -> dict:
    """Hide and stop the permission widget."""
    global _permission_widget
    with _permission_lock:
        if _permission_widget is not None:
            _permission_widget.stop()
            _permission_widget = None
    return {"widget": False}



# ------------------------------------------------------- accessibility tree

def _walk_tree(control: auto.Control, depth: int, state: dict):
    """Pre-order walk with stable element indexes used by click_element etc."""
    if state["count"] >= MAX_TREE_NODES or depth > MAX_TREE_DEPTH:
        return
    index = state["count"]
    state["count"] += 1

    try:
        name = control.Name or ""
        ctype = control.ControlTypeName or "Unknown"
        cls = control.ClassName or ""
        auto_id = control.AutomationId or ""
        rect = control.BoundingRectangle
        rect_str = "" if rect is None else f"Rect=({int(rect.left)},{int(rect.top)},{int(rect.width())},{int(rect.height())})"
    except Exception:
        name, ctype, cls, auto_id, rect_str = "", "Unknown", "", "", ""

    line = f"[{index}] {ctype} {name!r}"
    parts = []
    if cls:
        parts.append(f"ClassName={cls}")
    if auto_id:
        parts.append(f"AutomationId={auto_id}")
    if rect_str:
        parts.append(rect_str)
    if parts:
        line += f" ({', '.join(parts)})"
    state["lines"].append(line)

    try:
        children = control.GetChildren()
    except Exception:
        return
    for child in children:
        _walk_tree(child, depth + 1, state)


def accessibility_tree(handle: int) -> str:
    root = control_by_handle(handle)
    state = {"lines": [], "count": 0}
    _walk_tree(root, 0, state)
    return "\n".join(state["lines"])


def _nth_control(handle: int, index: int):
    """Re-walk the tree and return the control at the given pre-order index."""
    root = control_by_handle(handle)
    state = {"count": 0, "found": None}

    def walk(control: auto.Control, depth: int):
        if state["found"] is not None or depth > MAX_TREE_DEPTH:
            return
        current = state["count"]
        state["count"] += 1
        if current == index:
            state["found"] = control
            return
        try:
            for child in control.GetChildren():
                walk(child, depth + 1)
                if state["found"] is not None:
                    return
        except Exception:
            return

    walk(root, 0)
    if state["found"] is None:
        raise RuntimeError(f"element index {index} is no longer valid; re-run get_window_state")
    return state["found"]


# ---------------------------------------------------------------- operations

def list_windows(params: dict) -> dict:
    root = auto.GetRootControl()
    windows = []
    for child in root.GetChildren():
        if not is_real_window(child):
            continue
        handle = window_id(child)
        rect = window_rect(handle)
        windows.append({
            "windowId": handle,
            "appName": child.ClassName or "",
            "title": child.Name or "",
            "className": child.ClassName or "",
            "rect": rect,
        })
    windows.sort(key=lambda w: w["title"].lower())
    return {"windows": windows}


def get_window_state(params: dict) -> dict:
    handle = int(params["windowId"])
    include_screenshot = bool(params.get("includeScreenshot", True))
    include_text = bool(params.get("includeText", False))
    screenshot_path = params.get("screenshotPath")

    result = {
        "windowId": handle,
        "title": window_title(handle),
        "rect": window_rect(handle),
    }
    if include_screenshot:
        # Hide the "DSH is controlling" overlay so it does not pollute the
        # screenshot the vision model sees, then bring it back immediately.
        # hide_sync/show_sync bypass the Tk message queue (100ms poll latency)
        # so the overlay is guaranteed gone before mss captures the screen.
        _overlay.hide_sync()
        try:
            result["screenshotPath"] = take_screenshot(handle, screenshot_path)
        finally:
            _overlay.show_sync()
    if include_text:
        result["accessibilityTree"] = accessibility_tree(handle)
    return result


def activate_window(params: dict) -> dict:
    handle = int(params["windowId"])
    # SetForegroundWindow is the most reliable cross-class activation API;
    # SetActive is only available on WindowControl/PaneControl.
    _force_foreground(handle)
    time.sleep(0.2)
    return {"activated": True, "windowId": handle}


def _force_foreground(handle: int) -> bool:
    """Bring a window to the foreground, bypassing the foreground lock.

    Windows restricts SetForegroundWindow to the process that received the
    last input event (foreground lock). The classic workarounds: briefly
    press-and-release Alt (registers "user input"), or AttachThreadInput to
    the foreground thread. Returns True when the window is in the foreground.
    """
    try:
        if _user32.GetForegroundWindow() == handle:
            return True
        if auto.SetForegroundWindow(handle):
            time.sleep(0.05)
            if _user32.GetForegroundWindow() == handle:
                return True
        # Alt-key trick: a synthesized Alt press/release is treated as user
        # input, unlocking SetForegroundWindow for a moment.
        _user32.keybd_event(0x12, 0, 0, 0)  # VK_MENU down
        _user32.keybd_event(0x12, 0, 2, 0)  # VK_MENU up
        time.sleep(0.05)
        if auto.SetForegroundWindow(handle):
            time.sleep(0.05)
            if _user32.GetForegroundWindow() == handle:
                return True
        # AttachThreadInput trick: join the foreground thread's input queue.
        fg = _user32.GetForegroundWindow()
        fg_tid = _user32.GetWindowThreadProcessId(ctypes.c_void_p(fg), None)
        my_tid = _user32.GetCurrentThreadId()
        attached = False
        try:
            attached = bool(_user32.AttachThreadInput(my_tid, fg_tid, True))
            if auto.SetForegroundWindow(handle):
                time.sleep(0.05)
                return _user32.GetForegroundWindow() == handle
        finally:
            if attached:
                _user32.AttachThreadInput(my_tid, fg_tid, False)
        return _user32.GetForegroundWindow() == handle
    except Exception:
        return _user32.GetForegroundWindow() == handle


def click(params: dict) -> dict:
    handle = int(params["windowId"])
    _block_dsh_interaction(handle)
    element_index = params.get("elementIndex")
    click_method = str(params.get("clickMethod", "auto")).lower()
    button = params.get("mouseButton", "left")
    count = max(1, int(params.get("clickCount", 1)))

    if element_index is not None:
        control = _nth_control(handle, int(element_index))
        # Codex-style accessibility click: UIA patterns first.
        try:
            inv = control.GetPattern(auto.PatternId.InvokePattern)
            if inv is not None:
                inv.Invoke()
                return {"clicked": True, "elementIndex": int(element_index), "method": "invoke"}
        except Exception:
            pass
        try:
            sel = control.GetPattern(auto.PatternId.SelectionItemPattern)
            if sel is not None:
                sel.Select()
                return {"clicked": True, "elementIndex": int(element_index), "method": "select"}
        except Exception:
            pass
        try:
            tog = control.GetPattern(auto.PatternId.TogglePattern)
            if tog is not None:
                tog.Toggle()
                return {"clicked": True, "elementIndex": int(element_index), "method": "toggle"}
        except Exception:
            pass
        # Fallback: click at the element center (physical -> logical).
        r = control.BoundingRectangle
        if r is None or r.width() <= 0 or r.height() <= 0:
            raise RuntimeError("element has no usable bounds")
        scale = _dpi_scale(handle)
        return click({"windowId": handle, "x": int((r.left + r.right) // 2 / scale),
                      "y": int((r.top + r.bottom) // 2 / scale),
                      "mouseButton": button, "clickCount": count,
                      "clickMethod": click_method})

    if params.get("x") is None or params.get("y") is None:
        raise RuntimeError("click requires either elementIndex or x/y")
    x, y = int(params["x"]), int(params["y"])
    _check_in_window(handle, x, y)
    sx, sy = _rect_to_screen(handle, x, y)
    if click_method in ("post", "message"):
        # Posted messages: background-safe for native Win32 apps (Codex
        # app_post style), but Chromium ignores them — browsers need real input.
        post_click(handle, sx, sy, button, count)
        return {"clicked": True, "x": x, "y": y, "screenX": sx, "screenY": sy, "method": "post"}
    # Real-mouse click: bring the window to the foreground first, otherwise
    # Windows swallows the click and the injected input lands elsewhere.
    _force_foreground(handle)
    time.sleep(0.15)
    for _ in range(count):
        if button in ("right", "r"):
            auto.RightClick(sx, sy)
        elif button in ("middle", "m"):
            auto.MiddleClick(sx, sy)
        else:
            auto.Click(sx, sy)
    return {"clicked": True, "x": x, "y": y, "screenX": sx, "screenY": sy, "method": "mouse"}


def type_text(params: dict) -> dict:
    handle = int(params["windowId"])
    _block_dsh_interaction(handle)
    text = str(params.get("text", ""))
    # Real keyboard input via SendInput Unicode events: bypasses the IME and
    # supports Chinese directly. The window must be foreground, otherwise the
    # injected keystrokes would land in whatever window is in front.
    _force_foreground(handle)
    time.sleep(0.15)
    if not send_unicode(text):
        # Fallback: clipboard paste (Ctrl+V) for apps that ignore Unicode events.
        auto.SetClipboardText(text)
        auto.SendKeys("{Ctrl}v", interval=0.01, waitTime=0.2)
    return {"typed": True, "chars": len(text)}


_MODIFIER_VKS = {
    "ctrl": auto.Keys.VK_CONTROL,
    "control": auto.Keys.VK_CONTROL,
    "control_l": auto.Keys.VK_LCONTROL,
    "control_r": auto.Keys.VK_RCONTROL,
    "alt": auto.Keys.VK_MENU,
    "alt_l": auto.Keys.VK_LMENU,
    "alt_r": auto.Keys.VK_RMENU,
    "shift": auto.Keys.VK_SHIFT,
    "shift_l": auto.Keys.VK_LSHIFT,
    "shift_r": auto.Keys.VK_RSHIFT,
    # Windows key is intentionally not mapped (safety).
}

_SPECIAL_VKS = {
    "return": auto.Keys.VK_RETURN,
    "enter": auto.Keys.VK_RETURN,
    "tab": auto.Keys.VK_TAB,
    "escape": auto.Keys.VK_ESCAPE,
    "esc": auto.Keys.VK_ESCAPE,
    "space": auto.Keys.VK_SPACE,
    "backspace": auto.Keys.VK_BACK,
    "delete": auto.Keys.VK_DELETE,
    "up": auto.Keys.VK_UP,
    "down": auto.Keys.VK_DOWN,
    "left": auto.Keys.VK_LEFT,
    "right": auto.Keys.VK_RIGHT,
    "home": auto.Keys.VK_HOME,
    "end": auto.Keys.VK_END,
    "pageup": auto.Keys.VK_PRIOR,
    "pagedown": auto.Keys.VK_NEXT,
    "insert": auto.Keys.VK_INSERT,
    "capslock": auto.Keys.VK_CAPITAL,
    "numlock": auto.Keys.VK_NUMLOCK,
    "scrolllock": auto.Keys.VK_SCROLL,
    "printscreen": auto.Keys.VK_SNAPSHOT,
    "pause": auto.Keys.VK_PAUSE,
    "kp_0": auto.Keys.VK_NUMPAD0,
    "kp_1": auto.Keys.VK_NUMPAD1,
    "kp_2": auto.Keys.VK_NUMPAD2,
    "kp_3": auto.Keys.VK_NUMPAD3,
    "kp_4": auto.Keys.VK_NUMPAD4,
    "kp_5": auto.Keys.VK_NUMPAD5,
    "kp_6": auto.Keys.VK_NUMPAD6,
    "kp_7": auto.Keys.VK_NUMPAD7,
    "kp_8": auto.Keys.VK_NUMPAD8,
    "kp_9": auto.Keys.VK_NUMPAD9,
    "numpad_0": auto.Keys.VK_NUMPAD0,
    "numpad_1": auto.Keys.VK_NUMPAD1,
    "numpad_2": auto.Keys.VK_NUMPAD2,
    "numpad_3": auto.Keys.VK_NUMPAD3,
    "numpad_4": auto.Keys.VK_NUMPAD4,
    "numpad_5": auto.Keys.VK_NUMPAD5,
    "numpad_6": auto.Keys.VK_NUMPAD6,
    "numpad_7": auto.Keys.VK_NUMPAD7,
    "numpad_8": auto.Keys.VK_NUMPAD8,
    "numpad_9": auto.Keys.VK_NUMPAD9,
    "numpad_add": auto.Keys.VK_ADD,
    "numpad_subtract": auto.Keys.VK_SUBTRACT,
    "numpad_multiply": auto.Keys.VK_MULTIPLY,
    "numpad_divide": auto.Keys.VK_DIVIDE,
    "numpad_decimal": auto.Keys.VK_DECIMAL,
}
for _f in range(1, 25):
    _SPECIAL_VKS[f"f{_f}"] = getattr(auto.Keys, f"VK_F{_f}")

# 常用标点单字符 → VK（Ctrl+Shift+! 等组合需要 VK 而不是字符）。
_PUNCT_VKS = {
    ".": auto.Keys.VK_OEM_PERIOD,
    ",": auto.Keys.VK_OEM_COMMA,
    "/": auto.Keys.VK_OEM_2,
    "\\": auto.Keys.VK_OEM_5,
    ";": auto.Keys.VK_OEM_1,
    "'": auto.Keys.VK_OEM_7,
    "[": auto.Keys.VK_OEM_4,
    "]": auto.Keys.VK_OEM_6,
    "-": auto.Keys.VK_OEM_MINUS,
    "=": auto.Keys.VK_OEM_PLUS,
    "`": auto.Keys.VK_OEM_3,
}


def _key_to_vk(name: str) -> int | None:
    """Map one key token (lowercased) to a virtual-key code, or None."""
    if len(name) == 1:
        if name.isalnum():
            # '0'-'9' and 'a'-'z' VK codes equal their ASCII codes.
            return ord(name.upper())
        return _PUNCT_VKS.get(name)
    return _SPECIAL_VKS.get(name)


def parse_key_combo(key: str) -> tuple[list[int], int]:
    """Parse "Control_L+Shift_L+Tab" into (modifier VKs, main VK).

    Raises RuntimeError for empty input, Windows/Meta shortcuts, unknown
    modifiers, or unknown keys — never falls back to typing characters.
    """
    tokens = [t.strip() for t in key.split("+") if t.strip()]
    if not tokens:
        raise RuntimeError("key is required")
    lowered = {t.lower() for t in tokens}
    if any(w in lowered for w in ("meta", "win", "windows", "cmd", "command", "super", "os")):
        raise RuntimeError("Windows key / Meta shortcuts are not allowed")
    hold_vks = []
    for token in tokens[:-1]:
        vk = _MODIFIER_VKS.get(token.lower())
        if vk is None:
            raise RuntimeError(f"unsupported modifier: {token}")
        hold_vks.append(vk)
    main_vk = _key_to_vk(tokens[-1].lower())
    if main_vk is None:
        raise RuntimeError(f"unsupported key: {tokens[-1]}")
    return hold_vks, main_vk


def press_key(params: dict) -> dict:
    handle = int(params["windowId"])
    _block_dsh_interaction(handle)
    key = str(params.get("key", ""))
    hold_vks, main_vk = parse_key_combo(key)
    # Real keyboard chord via keybd_event: works with Chromium and native
    # apps. The window must be foreground so the keystrokes don't leak into
    # whatever window is in front (e.g. the DSH chat window).
    _force_foreground(handle)
    time.sleep(0.15)
    for vk in hold_vks:
        auto.PressKey(vk, waitTime=0.01)
    try:
        auto.PressKey(main_vk, waitTime=0.01)
        time.sleep(0.02)
        auto.ReleaseKey(main_vk, waitTime=0.01)
    finally:
        for vk in reversed(hold_vks):
            auto.ReleaseKey(vk, waitTime=0.01)
    return {"pressed": True, "key": key, "modifiers": len(hold_vks)}


def scroll(params: dict) -> dict:
    handle = int(params["windowId"])
    _block_dsh_interaction(handle)
    x, y = int(params["x"]), int(params["y"])
    _check_in_window(handle, x, y)
    sx, sy = _rect_to_screen(handle, x, y)
    _force_foreground(handle)
    auto.SetCursorPos(sx, sy)
    scroll_y = int(params.get("scrollY", 0))
    scroll_x = int(params.get("scrollX", 0))
    # Each WheelUp/Down call scrolls one notch; use abs(delta)//120 as a rough
    # notch count (Windows wheel delta is 120).
    times = max(1, abs(scroll_y) // 120 if scroll_y else 0)
    if scroll_y > 0:
        auto.WheelUp(times)
    elif scroll_y < 0:
        auto.WheelDown(times)
    if scroll_x:
        # Horizontal wheel: hold Shift down for the whole gesture (SendKeys
        # "{Shift}" would press-release it immediately, so use PressKey).
        auto.PressKey(auto.Keys.VK_SHIFT, waitTime=0.01)
        try:
            times = max(1, abs(scroll_x) // 120 if scroll_x else 0)
            if scroll_x > 0:
                auto.WheelUp(times)
            else:
                auto.WheelDown(times)
        finally:
            auto.ReleaseKey(auto.Keys.VK_SHIFT, waitTime=0.01)
    return {"scrolled": True, "x": x, "y": y, "scrollX": scroll_x, "scrollY": scroll_y}


def drag(params: dict) -> dict:
    handle = int(params["windowId"])
    _block_dsh_interaction(handle)
    fx, fy = int(params["fromX"]), int(params["fromY"])
    tx, ty = int(params["toX"]), int(params["toY"])
    _check_in_window(handle, fx, fy)
    _check_in_window(handle, tx, ty)
    sx, sy = _rect_to_screen(handle, fx, fy)
    ex, ey = _rect_to_screen(handle, tx, ty)
    _force_foreground(handle)
    auto.DragDrop(sx, sy, ex, ey)
    return {"dragged": True, "from": (sx, sy), "to": (ex, ey)}


_BROWSER_HINTS = ("firefox", "msedge", "chrome", "edge", "brave", "opera", "vivaldi")


def _is_browser_app(app: str) -> bool:
    lower = app.lower()
    return any(h in lower for h in _BROWSER_HINTS)


def launch_app(params: dict) -> dict:
    app = str(params.get("app", ""))
    if not app:
        raise RuntimeError("app is required")
    raw_args = params.get("args")
    args = [str(a) for a in raw_args] if isinstance(raw_args, list) else []

    # Hard safety rule: launching a browser must never reuse/overwrite the DSH
    # chat window, so always force a brand-new window.
    forced_new_window = False
    if _is_browser_app(app):
        lowered = [a.lower() for a in args]
        if not any(a in ("--new-window", "-new-window", "--new-window ") for a in lowered):
            args = ["--new-window"] + args
            forced_new_window = True

    if args:
        subprocess.Popen([app] + args, shell=False)
    else:
        subprocess.Popen(app, shell=False)
    time.sleep(0.5)
    return {"launched": app, "args": args, "forcedNewWindow": forced_new_window}


def close(params: dict) -> dict:
    """Stop the overlay, hide the permission widget, and end the RPC loop."""
    overlay_end(params)
    permission_widget_hide(params)
    return {"closed": True}


# ------------------------------------------------------------------ rpc loop

HANDLERS = {
    "ping": lambda p: {"pong": True},
    "list_windows": list_windows,
    "get_window_state": get_window_state,
    "activate_window": activate_window,
    "click": click,
    "type_text": type_text,
    "press_key": press_key,
    "scroll": scroll,
    "drag": drag,
    "launch_app": launch_app,
    "overlay_begin": overlay_begin,
    "overlay_end": overlay_end,
    "permission_widget_show": permission_widget_show,
    "permission_widget_hide": permission_widget_hide,
    "close": close,
}


def main() -> int:
    # Use physical pixels so GetSystemMetrics matches mss/UI Automation.
    try:
        import ctypes
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

    # Node 插件按 UTF-8 与本进程通信；Windows 上 Python 默认用 GBK 读写
    # stdin/stdout，会导致中文变成乱码，这里强制统一为 UTF-8。
    for _stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except Exception as exc:
            # Keep the pipe alive even on a malformed request.
            sys.stdout.write(json.dumps({"id": None, "ok": False, "error": f"invalid JSON: {exc}"}) + "\n")
            sys.stdout.flush()
            continue

        req_id = request.get("id")
        method = request.get("method")
        params = request.get("params") or {}
        try:
            handler = HANDLERS.get(method)
            if handler is None:
                raise RuntimeError(f"unknown method: {method}")
            result = handler(params)
            sys.stdout.write(json.dumps({"id": req_id, "ok": True, "result": result}) + "\n")
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            sys.stdout.write(json.dumps({"id": req_id, "ok": False, "error": str(exc)}) + "\n")
        sys.stdout.flush()
        if method == "close":
            # Graceful exit: the response above is written first, then normal
            # process exit runs atexit (cursor/overlay cleanup).
            break
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        pass
