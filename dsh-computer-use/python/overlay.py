#!/usr/bin/env python3
"""Full-screen blue highlight + top banner + custom system cursor for DSH.

Used while dsh-computer-use is controlling the desktop so a human can see at
a glance that DSH is in control and that the mouse is being driven by the
agent (the cursor is replaced with a blue DSH-style arrow).

The overlay is a transparent, click-through, always-on-top Tk window. The
cursor is swapped with SetSystemCursor and restored with
SystemParametersInfo(SPI_SETCURSORS).
"""

from __future__ import annotations

import atexit
import ctypes
import queue
import tempfile
import threading
from pathlib import Path

try:
    import tkinter as tk
except Exception:  # pragma: no cover - non-Windows / headless
    tk = None

user32 = ctypes.windll.user32

GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
WS_EX_TRANSPARENT = 0x00000020
WS_EX_NOACTIVATE = 0x08000000
WS_EX_TOOLWINDOW = 0x00000080
SPI_SETCURSORS = 0x0057
OCR_NORMAL = 32512
OCR_IBEAM = 32513
IMAGE_CURSOR = 2
LR_LOADFROMFILE = 0x0010

DEFAULT_COLOR = "#2563EB"
DEFAULT_TEXT = "DSH 正在控制你的电脑"


class OverlayManager:
    """One click-through full-screen overlay running in a daemon thread."""

    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._queue: queue.Queue = queue.Queue()
        self._ready = threading.Event()
        self._root: tk.Tk | None = None
        self._canvas: tk.Canvas | None = None
        self._hwnd: int | None = None
        self._visible = False

    # ------------------------------------------------------------ lifecycle

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        if tk is None:
            return
        self._thread = threading.Thread(target=self._run, daemon=True, name="dsh-overlay")
        self._thread.start()
        self._ready.wait(5)

    def stop(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            self._queue.put(("destroy",))
            self._thread.join(timeout=2)
        self._thread = None
        self._root = None
        self._canvas = None
        self._hwnd = None

    def show(self, text: str = DEFAULT_TEXT, color: str = DEFAULT_COLOR) -> None:
        self.start()
        self._queue.put(("draw", text, color))

    def clear(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            self._queue.put(("clear",))

    def hide(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            self._queue.put(("hide",))

    def show_again(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            self._queue.put(("show",))

    def hide_sync(self) -> None:
        """Synchronously hide the overlay window, bypassing the Tk queue.

        Used right before a screenshot: the queued ``hide`` message has up to
        100ms poll latency, which would let the blue border leak into captures.
        """
        hwnd = self._hwnd
        if hwnd and self._visible:
            user32.ShowWindow(hwnd, 0)  # SW_HIDE

    def show_sync(self) -> None:
        """Synchronously bring the overlay window back after a screenshot."""
        hwnd = self._hwnd
        if hwnd and self._visible:
            user32.ShowWindow(hwnd, 5)  # SW_SHOW

    # ------------------------------------------------------------ tk thread

    def _run(self) -> None:
        if tk is None:
            return
        root = tk.Tk()
        root.withdraw()
        root.title("DSH Control Overlay")
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-transparentcolor", "magenta")
        width = user32.GetSystemMetrics(0)
        height = user32.GetSystemMetrics(1)
        root.geometry(f"{width}x{height}+0+0")
        canvas = tk.Canvas(root, bg="magenta", highlightthickness=0, cursor="none")
        canvas.pack(fill="both", expand=True)

        self._root = root
        self._canvas = canvas

        # Force the native HWND to exist before applying extended styles.
        root.update_idletasks()

        # Make the whole window click-through and non-activating.
        hwnd = user32.GetParent(root.winfo_id())
        style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        user32.SetWindowLongW(
            hwnd,
            GWL_EXSTYLE,
            style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
        )
        self._hwnd = hwnd
        self._ready.set()

        def poll() -> None:
            try:
                while True:
                    cmd = self._queue.get_nowait()
                    if cmd[0] == "draw":
                        self._draw(cmd[1], cmd[2])
                    elif cmd[0] == "clear":
                        self._clear()
                    elif cmd[0] == "hide":
                        self._hide()
                    elif cmd[0] == "show":
                        self._show()
                    elif cmd[0] == "destroy":
                        root.destroy()
                        return
            except queue.Empty:
                pass
            root.after(100, poll)

        root.after(100, poll)
        root.mainloop()

    # ---------------------------------------------------------------- draw

    def _draw(self, text: str, color: str) -> None:
        if self._canvas is None or self._root is None:
            return
        canvas = self._canvas
        canvas.delete("all")
        width = user32.GetSystemMetrics(0)
        height = user32.GetSystemMetrics(1)

        thickness = 8
        # Full-screen blue highlight border.
        canvas.create_rectangle(0, 0, width, thickness, fill=color, outline="")
        canvas.create_rectangle(0, height - thickness, width, height, fill=color, outline="")
        canvas.create_rectangle(0, 0, thickness, height, fill=color, outline="")
        canvas.create_rectangle(width - thickness, 0, width, height, fill=color, outline="")

        # Small blue banner at the top center.
        banner_w = min(420, width - 40)
        banner_h = 46
        x0 = width // 2 - banner_w // 2
        y0 = 10
        x1 = x0 + banner_w
        y1 = y0 + banner_h
        canvas.create_rectangle(x0, y0, x1, y1, fill=color, outline="white", width=2)
        canvas.create_text(
            width // 2,
            y0 + banner_h // 2,
            text=text,
            fill="white",
            font=("Microsoft YaHei UI", 14, "bold"),
        )

        self._visible = True
        self._root.deiconify()
        self._root.lift()
        self._root.attributes("-topmost", True)

    def _clear(self) -> None:
        if self._canvas is not None:
            self._canvas.delete("all")
        self._visible = False
        if self._root is not None:
            self._root.withdraw()

    def _hide(self) -> None:
        if self._root is not None and self._visible:
            self._root.withdraw()

    def _show(self) -> None:
        if self._root is not None and self._visible:
            self._root.deiconify()
            self._root.lift()
            self._root.attributes("-topmost", True)


# ---------------------------------------------------------------- cursor

_cursor_path: str | None = None
_cursor_lock = threading.Lock()


def _make_cursor_file() -> str | None:
    """Create a small blue arrow .cur file (lazy, once)."""
    global _cursor_path
    if _cursor_path is not None and Path(_cursor_path).exists():
        return _cursor_path
    with _cursor_lock:
        if _cursor_path is not None and Path(_cursor_path).exists():
            return _cursor_path
        try:
            from PIL import Image, ImageDraw

            img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            # Blue arrow with a small white outline.
            d.polygon([(0, 0), (0, 22), (6, 17), (10, 26), (15, 24), (11, 15), (18, 15)], fill=(37, 99, 235, 255))
            d.polygon([(0, 0), (0, 22), (6, 17), (10, 26), (15, 24), (11, 15), (18, 15)], outline=(255, 255, 255, 255))
            path = Path(tempfile.gettempdir()) / "dsh-control-cursor.cur"
            img.save(str(path), format="CUR", sizes=[(32, 32)])
            _cursor_path = str(path)
        except Exception:
            _cursor_path = None
        return _cursor_path


def set_custom_cursor(enabled: bool) -> None:
    if enabled:
        _enable_custom_cursor()
    else:
        _restore_cursors()


def _enable_custom_cursor() -> None:
    path = _make_cursor_file()
    if not path:
        return
    handle = user32.LoadImageW(None, path, IMAGE_CURSOR, 0, 0, LR_LOADFROMFILE)
    if not handle:
        return
    for system_id in (OCR_NORMAL, OCR_IBEAM):
        copy = user32.CopyIcon(handle)
        if copy:
            user32.SetSystemCursor(copy, system_id)
    user32.DestroyIcon(handle)


def _restore_cursors() -> None:
    user32.SystemParametersInfoW(SPI_SETCURSORS, 0, None, 0)


atexit.register(lambda: set_custom_cursor(False))
