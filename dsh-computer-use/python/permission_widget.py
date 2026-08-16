#!/usr/bin/env python3
"""Small always-on-top permission widget for DSH Computer Use.

A tiny rounded window that sits beside the DSH chat window and lets the user
decide whether DSH is allowed to control the computer. The checkbox state is
persisted to a small JSON file; the Node plugin reads that file before every
desktop action and refuses to act when it is disabled.
"""

from __future__ import annotations

import ctypes
import json
import queue
import threading
from pathlib import Path

try:
    import tkinter as tk
except Exception:  # pragma: no cover
    tk = None

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
WS_EX_TRANSPARENT = 0x00000020
WS_EX_NOACTIVATE = 0x08000000
WS_EX_TOOLWINDOW = 0x00000080
WIDTH = 300
HEIGHT = 104
DEFAULT_TEXT = "是否允许 DSH 控制你的电脑"
DEFAULT_CHECK_TEXT = "允许 DSH 控制电脑"
ACCENT = "#2563EB"
BG = "#0B1220"
FG = "#E5E7EB"


class PermissionWidget:
    """One tiny rounded Tk window running in a daemon thread."""

    def __init__(self, permission_file: str) -> None:
        self.permission_file = permission_file
        self._thread: threading.Thread | None = None
        self._queue: queue.Queue = queue.Queue()
        self._ready = threading.Event()
        self._root: tk.Tk | None = None
        self._var: tk.BooleanVar | None = None

    # ------------------------------------------------------------ lifecycle

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        if tk is None:
            return
        self._thread = threading.Thread(target=self._run, daemon=True, name="dsh-permission-widget")
        self._thread.start()
        self._ready.wait(5)

    def stop(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            self._queue.put(("destroy",))
            self._thread.join(timeout=2)
        self._thread = None
        self._root = None
        self._var = None

    # ------------------------------------------------------------ state io

    def _load(self) -> bool:
        try:
            data = json.loads(Path(self.permission_file).read_text(encoding="utf-8"))
            return bool(data.get("allowed", False))
        except Exception:
            # 缺失/损坏 = 不允许（安全默认，与 Node 侧 allowControl 默认 false 一致）。
            return False

    def _save(self, allowed: bool) -> None:
        try:
            path = Path(self.permission_file)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"allowed": bool(allowed)}, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    # ------------------------------------------------------------ tk thread

    def _run(self) -> None:
        if tk is None:
            return
        root = tk.Tk()
        root.withdraw()
        root.title("DSH Computer Use Permission")
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.configure(bg=BG)

        frame = tk.Frame(root, bg=BG, highlightbackground=ACCENT, highlightthickness=2)
        frame.pack(fill="both", expand=True)

        title = tk.Label(
            frame,
            text=DEFAULT_TEXT,
            bg=BG,
            fg=FG,
            font=("Microsoft YaHei UI", 11, "bold"),
            anchor="w",
        )
        title.pack(fill="x", padx=14, pady=(10, 2))

        self._var = tk.BooleanVar(value=self._load())
        check = tk.Checkbutton(
            frame,
            text=DEFAULT_CHECK_TEXT,
            variable=self._var,
            command=self._on_toggle,
            bg=BG,
            fg=FG,
            activebackground=BG,
            activeforeground="#FFFFFF",
            selectcolor=ACCENT,
            font=("Microsoft YaHei UI", 10),
            anchor="w",
            highlightthickness=0,
            bd=0,
        )
        check.pack(fill="x", padx=12, pady=(0, 8))

        self._root = root
        root.update_idletasks()

        # Position beside the DSH chat window (left edge), fallback top-right.
        x, y = self._desired_position()
        root.geometry(f"{WIDTH}x{HEIGHT}+{x}+{y}")

        # Rounded corners.
        hwnd = user32.GetParent(root.winfo_id())
        region = gdi32.CreateRoundRectRgn(0, 0, WIDTH + 1, HEIGHT + 1, 22, 22)
        user32.SetWindowRgn(hwnd, region, True)
        ex = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        # No WS_EX_TRANSPARENT here: the checkbox must stay clickable. It is a
        # small window, so intercepting clicks inside its bounds is intended.
        user32.SetWindowLongW(
            hwnd,
            GWL_EXSTYLE,
            ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
        )

        self._ready.set()
        root.deiconify()
        root.lift()
        root.attributes("-topmost", True)

        def poll() -> None:
            try:
                while True:
                    cmd = self._queue.get_nowait()
                    if cmd[0] == "destroy":
                        root.destroy()
                        return
            except queue.Empty:
                pass
            root.after(100, poll)

        root.after(100, poll)
        root.mainloop()

    def _desired_position(self) -> tuple[int, int]:
        screen_w = user32.GetSystemMetrics(0)
        screen_h = user32.GetSystemMetrics(1)
        try:
            import uiautomation as auto

            for child in auto.GetRootControl().GetChildren():
                try:
                    title = child.Name or ""
                    if "DeepSeek Harness" in title or title.strip().lower() == "dsh":
                        r = child.BoundingRectangle
                        if r is not None and r.width() > 100:
                            left, right, top = int(r.left), int(r.right), int(r.top)
                            # Prefer the left side of the DSH window; fall back to
                            # the right side, then clamp inside the screen.
                            if left - WIDTH - 10 >= 0:
                                x = left - WIDTH - 10
                            elif right + 10 + WIDTH <= screen_w:
                                x = right + 10
                            else:
                                x = max(8, min(left + 16, screen_w - WIDTH - 8))
                            y = max(8, min(top + 90, screen_h - HEIGHT - 8))
                            return x, y
                except Exception:
                    continue
        except Exception:
            pass
        return max(8, screen_w - WIDTH - 16), max(8, min(96, screen_h - HEIGHT - 8))

    def _on_toggle(self) -> None:
        allowed = bool(self._var and self._var.get())
        self._save(allowed)
