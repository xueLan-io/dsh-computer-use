# dsh-computer-use 跨平台实施计划

> 状态：阶段 0 已完成、阶段 1 进行中——provider 接口与跨平台 provider 骨架已落地（未在真实 macOS/Linux 验证）。
> 基线：当前 Windows 0.1.x 可正常使用，本计划用于补齐跨平台前必须解决的 7 项缺口。

## 待解决的关键问题

1. 没有统一的 provider contract 测试。
2. `runtime.ts` 直接依赖 Windows native API。
3. `windowId` 假设是 HWND 数字，不能直接适配 macOS/Linux。
4. UIA 元素索引不适合作为跨平台稳定标识。
5. overlay、窗口激活、后台输入、剪贴板都存在平台差异。
6. 现有部分中文错误信息和 README 存在编码乱码，应先清理。
7. Linux Wayland 不能承诺与 Windows 相同的全局窗口控制能力。

---

## 一、目标发行结构

保留现有 Windows 包：

```text
dsh-computer-use
```

新增：

```text
dsh-computer-use-macos
dsh-computer-use-linux
```

三者对外暴露相同的 `computer_*` 工具接口，但底层 provider 不同。

建议内部目录：

```text
dsh-computer-use/
  core/
    observation
    approval
    permission
    tool contracts
    capability checks

  providers/
    windows/
    macos/
    linux/

  packages/
    dsh-computer-use
    dsh-computer-use-macos
    dsh-computer-use-linux
```

Windows 包不改名称、不改默认配置、不改安装方式。

---

## 二、先冻结 Windows 基线

在开始跨平台开发前，把当前 Windows 行为锁定为回归基线：

- observation 必须带 `observationId`。
- 过期 observation 必须拒绝动作。
- 窗口进程、路径、类名或尺寸变化时必须重新观察。
- UIA 元素动作必须复核 checksum。
- DSH 自身窗口始终禁止操作。
- 权限关闭后清理 observation、overlay、光标状态。
- 用户审批完成后再次检查权限。
- 剪贴板内容必须完整恢复。
- Windows 缺少预编译 provider 时自动使用 `node-gyp` 编译。
- 已有 Windows 用户无需额外安装 Python、Rust 或系统服务。

这一步需要建立 Windows provider 的行为快照和 contract tests，之后所有改动都必须通过。

### 现有代码可拆分性（代码级分析）

| 文件 | 平台依赖 | 可重用性 |
|---|---|---|
| `src/config.ts` | 无 | 完全跨平台 |
| `src/rpc.ts` | 无 | 完全跨平台 |
| `src/index.ts` | 无 | 完全跨平台 |
| `client/permission-panel.js` | 无 | 完全跨平台 |
| `src/tools.ts` | 仅 1 处 `process.platform` 检查（第 43 行） | 几乎完全跨平台 |
| `src/runtime.ts` | 直接 `import * as native from 'dsh-computer-use-native'` | 需要完全重写 |
| `native/src/provider.cc` | 1318 行纯 Win32 | 不可跨平台，需重写 |

### 现有 native API 与跨平台接口的映射

`native/index.d.ts` 已定义 34 个函数，按类别划分：

- **窗口管理**（3）：`listWindows`, `getWindow`, `activateWindow`
- **截图**（3）：`captureWindow`, `screenRect`, `captureScreen`
- **鼠标输入**（4）：`moveCursor`, `click`, `scroll`, `drag`
- **键盘输入**（3）：`typeText`, `pressKey`, `paste`
- **后台输入**（3）：`postClick`, `postWheel`, `postChar`
- **辅助功能**（4）：`accessibilityTree`, `invokeAtPoint`, `elementClick`, `elementRect`
- **剪贴板**（4）：`saveClipboard`, `restoreClipboard`, `setClipboardText`, `getClipboardText`
- **Overlay**（5）：`overlayCreate`, `overlayShow`, `overlayRefresh`, `overlayHide`, `overlayDestroy`
- **其他**（2）：`restoreSystemCursors`, `runtimeInfo`

### 阶段 0：基线和清理

#### 0.1 编码清理

经检查，`README.md` 和所有源文件 UTF-8 编码正常，没有乱码。但以下位置的中文错误信息在跨平台时应统一为英文（code-first），message 保留可选中文用于 UI 显示：

| 文件 | 行号 | 当前中文 | 建议 |
|---|---|---|---|
| `runtime.ts` | 68 | `窗口 ${windowId} 不存在` | code-first 英文 |
| `runtime.ts` | 101 | `禁止对受保护的 DSH 窗口执行 ${action}` | code-first 英文 |
| `runtime.ts` | 184 | `observation 已过期，请重新获取窗口状态` | code-first 英文 |
| `runtime.ts` | 191 | `窗口状态已变化，不能执行 ${action}` | code-first 英文 |
| `runtime.ts` | 219, 231 | 坐标越界中文信息 | code-first 英文 |
| `tools.ts` | 43 | `dsh-computer-use 仅支持 Windows` | 改为运行时平台检测 |
| `tools.ts` | 63 | 当前会话审批策略为"不再询问" | code-first 英文 |
| `config.ts` | 55-56 | `DISABLED_MESSAGE` | 保留为 i18n 字符串 |

#### 0.2 Windows Contract Tests

目前没有任何测试。需要创建的第一批测试套件：

```text
tests/
  contracts/
    provider.test.ts       # DesktopProvider 接口契约测试
    observation.test.ts    # Observation 生命周期测试
    protection.test.ts     # 品牌保护测试
    capability.test.ts     # Capability 模型测试
  windows/
    provider.win.test.ts   # Windows 特定行为测试
```

Contract tests 应该验证（不依赖真实窗口环境）：

1. `createObservation` 生成合法 observationId
2. `validateObservation` 对过期 ID 抛出 `OBSOLETE_OBSERVATION`
3. `validateObservation` 对错误窗口 ID 抛出 `OBSERVATION_WINDOW_MISMATCH`
4. `brandProtected` 正确匹配 DSH/DeepSeek/Harness 模式
5. `assertSafeWindow` 对受保护窗口抛出 `PROTECTED_WINDOW`
6. `ComputerUseError.toJSON()` 格式一致
7. `point()` 坐标转换正确性
8. `validateElementIndex` 拒绝负数
9. overlay 配置变更立即生效

---

## 三、抽取公共 provider 接口

将 `runtime.ts` 中的平台无关逻辑和 Win32 调用分开。

### 3.1 公共接口（DesktopProvider）

```ts
interface DesktopProvider {
  runtimeInfo(): RuntimeInfo
  capabilities(): Capabilities

  listWindows(): Promise<DesktopWindow[]>
  getWindow(id: WindowId): Promise<DesktopWindow>
  captureWindow(id: WindowId, path: string): Promise<CaptureResult>
  activateWindow(id: WindowId): Promise<void>

  accessibilityTree(id: WindowId): Promise<AccessibilitySnapshot>

  click(request: ClickRequest): Promise<ActionResult>
  typeText(request: TypeTextRequest): Promise<ActionResult>
  pressKey(request: PressKeyRequest): Promise<ActionResult>
  scroll(request: ScrollRequest): Promise<ActionResult>
  drag(request: DragRequest): Promise<ActionResult>

  launchApp(request: LaunchRequest): Promise<LaunchResult>

  saveClipboard(): Promise<boolean>
  restoreClipboard(): Promise<boolean>

  startIndicator(target?: WindowId): Promise<void>
  stopIndicator(): Promise<void>
  dispose(): Promise<void>
}
```

### 3.2 职责划分

**公共 core 负责**：

- 工具注册。
- 审批。
- `allowControl` 权限。
- observation 生命周期。
- 窗口身份验证。
- UI 树 checksum。
- 错误格式。
- capability 检查。
- 截图附件处理。

**provider 只负责**：

- 枚举窗口。
- 截图。
- 输入。
- 原生辅助功能树。
- 剪贴板。
- 平台指示器。
- 平台启动应用。

### 3.3 Core 目录结构

```text
dsh-computer-use/
  core/
    types.ts              # DesktopProvider, WindowId, ElementId, Capabilities, 所有类型
    observation.ts        # Observation 生命周期
    protection.ts         # 品牌保护
    permissions.ts        # allowControl 检查
    approval.ts           # 审批逻辑
    actions.ts            # click/typeText/pressKey/scroll/drag 的平台无关包装
    errors.ts             # ComputerUseError 和错误码
    overlay.ts            # overlay 状态机（不含渲染）
    clipboard.ts          # 剪贴板 save/restore 逻辑
    tools.ts              # 9 个 tool 定义（从现有 tools.ts 提取）
    index.ts              # core 入口
  providers/
    windows/
      provider.ts         # WindowsProvider implements DesktopProvider
      native.d.ts
      native.mjs
      binding.gyp
      src/provider.cc
      package.json
    macos/
      provider.ts
      binding.gyp
      src/provider.mm
      package.json
    linux/
      provider.ts
      detection.ts        # X11/Wayland 检测
      x11/
        provider.ts
      wayland/
        provider.ts
      package.json
  packages/
    dsh-computer-use/           # Windows 包（保持原名）
    dsh-computer-use-macos/     # macOS 包
    dsh-computer-use-linux/     # Linux 包
    dsh-computer-use-core/      # 纯 TypeScript core
```

---

## 四、统一窗口和元素标识

不能继续把 HWND 数字作为通用设计。

### 4.1 类型定义

```ts
type WindowId = string
type ElementId = string
```

### 4.2 各平台 ID 生成

```text
Windows:   win:hWnd:0000000000123456
macOS:     mac:window:processId:sequence
Linux X11: x11:xid:0x03400007
Wayland:   provider 自己生成的 opaque token
```

### 4.3 兼容策略

- Windows 暂时继续接受旧的数字 `windowId`。
- 新版本同时接受字符串 ID。
- 新工具返回字符串 ID。
- 元素动作优先使用 `elementId`。
- `elementIndex` 仅作为 Windows 兼容字段保留。
- 元素引用应包含 observation 版本，避免树变化后误操作另一个元素。

### 4.4 实现草案

```ts
// core/identity.ts

/** 解析 WindowId 字符串，返回平台相关组件。 */
export function parseWindowId(id: WindowId): ParsedWindowId { ... }

/** 旧兼容：同时接受 number (HWND) 和 string WindowId。 */
export function resolveWindowId(input: number | string): WindowId {
  if (typeof input === 'number') {
    return `win:hWnd:${input.toString(16).padStart(16, '0')}`
  }
  return input
}

/** 从 Windows WindowId 提取旧 HWND 数字；非 Windows 返回 undefined。 */
export function extractLegacyHwnd(id: WindowId): number | undefined {
  if (id.startsWith('win:hWnd:')) {
    return parseInt(id.slice(9), 16)
  }
  return undefined
}
```

### 4.5 元素引用绑定 observation

```ts
// core/observation-element.ts

export interface ElementRef {
  elementId: ElementId
  observationId: string
  checksum: string  // UI 树在观察时的 checksum
}

export function validateElementRef(
  ref: ElementRef,
  currentObservation: Observation,
  provider: DesktopProvider,
): Promise<{ x: number; y: number }> { ... }
```

---

## 五、统一能力模型

每个平台都必须返回 capabilities，而不是让 core 猜测功能是否可用。

### 5.1 Capabilities 类型

```ts
interface Capabilities {
  windowEnumeration: boolean
  windowCapture: boolean | 'user-selected'
  accessibilityTree: boolean
  foregroundInput: boolean | 'portal'
  backgroundInput: boolean
  semanticClick: boolean
  clipboard: boolean | 'limited'
  clipboardRestore: boolean
  overlay: boolean | 'best-effort'
  launchApp: boolean
}
```

### 5.2 示例

Windows / macOS（完整能力）：

```ts
{
  windowEnumeration: true,
  windowCapture: true,
  accessibilityTree: true,
  foregroundInput: true,
  backgroundInput: true,
  semanticClick: true,
  clipboard: true,
  clipboardRestore: true,
  overlay: true,
  launchApp: true
}
```

Linux Wayland（受限兼容模式）：

```ts
{
  windowEnumeration: false,
  windowCapture: 'user-selected',
  accessibilityTree: true,
  foregroundInput: 'portal',
  backgroundInput: false,
  semanticClick: true,
  clipboard: 'limited',
  clipboardRestore: false,
  overlay: false,
  launchApp: true
}
```

### 5.3 工具行为规则

- capability 为 `false` 时直接返回 `CAPABILITY_UNAVAILABLE`。
- capability 为 `"user-selected"` 时明确要求用户授权。
- 不允许把"未执行"伪装成"执行成功"。
- 返回结果中带 `method` 和 `limitations`。

---

## 六、macOS 版本

包名：`dsh-computer-use-macos`

### 6.1 功能映射

| 接口方法 | macOS 实现 | 框架 |
|---|---|---|
| `listWindows()` | `CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID)` | CoreGraphics |
| `getWindow(id)` | 从列表中查找或按 PID 过滤 | CoreGraphics |
| `captureWindow(id, path)` | `CGWindowListCreateImage` 或 ScreenCaptureKit | CoreGraphics / ScreenCaptureKit |
| `activateWindow(id)` | `NSRunningApplication.activate()` + `AXUIElementPerformAction(kAXRaiseAction)` | AppKit / Accessibility |
| `accessibilityTree(id)` | `AXUIElementCreateApplication(pid)` 递归遍历 | Accessibility API |
| `elementClick(id, elId)` | `AXUIElementPerformAction(el, kAXPress)` | Accessibility API |
| `elementRect(id, elId)` | `AXUIElementCopyAttributeValue(kAXPositionAttribute/kAXSizeAttribute)` | Accessibility API |
| `moveCursor(x, y)` | `CGEventCreateMouseEvent(kCGEventMouseMoved)` | CoreGraphics |
| `click(req)` | `CGEventCreateMouseEvent(kCGEventLeftMouseDown/Up)` | CoreGraphics |
| `typeText(req)` | 剪贴板粘贴优先；fallback `CGEventKeyboardSetUnicodeString` | CoreGraphics |
| `pressKey(req)` | `CGEventCreateKeyboardEvent` | CoreGraphics |
| `scroll(req)` | `CGEventCreateScrollWheelEvent` | CoreGraphics |
| `drag(req)` | `CGEvent` mouseDown → move → mouseUp | CoreGraphics |
| `saveClipboard()` | `NSPasteboard.generalPasteboard` 序列化 | AppKit |
| `restoreClipboard()` | `NSPasteboard.generalPasteboard` 反序列化 | AppKit |
| `overlayCreate/Show/...` | 非激活 `NSPanel` + `CGWindowLevel` | AppKit |
| `launchApp(req)` | `NSWorkspace` 或 `open -a` | AppKit |

### 6.2 权限要求

- Accessibility（辅助功能）。
- Screen Recording（屏幕录制）。
- 必要时 Input Monitoring（输入监控）。

权限处理必须包括：

- 启动时检测权限。
- 工具调用前检查权限。
- 返回系统设置跳转链接。
- 告诉用户缺少哪一项权限。
- 不自动修改 TCC 权限。
- 截图权限不足时不能返回黑图并声称成功。

```ts
// providers/macos/permissions.ts

export interface MacosPermissionStatus {
  accessibility: 'granted' | 'denied' | 'unknown'
  screenRecording: 'granted' | 'denied' | 'unknown'
  inputMonitoring: 'granted' | 'denied' | 'unknown'  // optional
}

export const PERMISSION_URLS = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
} as const
```

### 6.3 剪贴板特殊处理

Windows 用 OLE `IDataObject` 能完整保存所有格式。macOS 的 `NSPasteboard` 不支持快照模式。

```ts
// providers/macos/clipboard.ts

interface ClipboardSnapshot {
  changeCount: number
  types: string[]
  contents: Map<string, ArrayBuffer>  // 按类型序列化
  fileUrls?: string[]                 // 若包含文件引用
}

export async function saveClipboard(): Promise<ClipboardSnapshot | null> {
  // 1. 读取 changeCount（用于检测外部变更）
  // 2. 枚举 pb.types
  // 3. 文本 → UTF-8；图片 → TIFF/PNG；富文本 → RTF/HTML data
  // 4. 文件 → 保存 URL / promised data
  // 5. 上限 10MB 防内存膨胀
}

export async function restoreClipboard(snapshot: ClipboardSnapshot): Promise<boolean> {
  // pb.clearContents()
  // 按类型原样写回（文件写 file reference，图片写 TIFF/PNG）
}
```

注意：macOS 剪贴板可能包含文件、富文本、图片和 promised data；promised data 恢复依赖 owner 进程仍在运行，需要单独降级处理。

### 6.4 Overlay 设计

```ts
// providers/macos/overlay.ts
export class MacosOverlay {
  // NSPanel 配置：
  // - level = NSStatusWindowLevel + 1
  // - styleMask = NSBorderlessWindowMask | NSNonactivatingPanel
  // - isOpaque = false, backgroundColor = clearColor
  // - ignoresMouseEvents = true（点击穿透）
  // - collectionBehavior = canJoinAllSpaces | fullScreenAuxiliary
  // - sharedWindow = true（允许被截屏）
  // 内容：
  // - CAShapeLayer 圆角矩形边框（DSH 品牌蓝 #4176E6）
  // - CATextLayer 顶部横幅文本
  // - 淡入淡出用 CABasicAnimation（200ms）
}
```

Overlay 不能抢焦点，也不能影响目标应用；不能出现在 Cmd+Tab 切换器。若多显示器截图受限于 macOS 的 screen recording 权限，overlay 需要按 display 独立创建。

### 6.5 浏览器新窗口

Windows 用 `--new-window` 对 macOS 不可泛化：

```ts
const BROWSER_LAUNCH: Record<string, (args: string[]) => string[]> = {
  'safari': (args) => ['--args', ...args],  // Safari 不支持 --new-window
  'google chrome': (args) => {
    if (!args.includes('--new-window')) args.unshift('--new-window')
    return args
  },
  'firefox': (args) => {
    if (!args.some(a => a === '-new-window')) args.unshift('-new-window')
    return args
  },
}
```

### 6.6 键盘布局与输入法

- `CGEventCreateKeyboardEvent` 使用 Apple HID 虚拟键码，需要单独的键名→虚拟键码映射表（与 Windows VK 不同）。
- 文本注入用 `CGEventKeyboardSetUnicodeString` 可绕过 IME。
- 组合键用 `CGEvent` flags（`kCGEventFlagMaskCommand` 等）。
- 非 ASCII 文本和输入法行为需要单独测试。

### 6.7 支持平台

- Intel x64（x86_64）
- Apple Silicon arm64
- macOS 13+（Ventura / Sonoma / Sequoia）

### 6.8 构建与预编译

```json
// providers/macos/package.json
{
  "name": "dsh-computer-use-macos-native",
  "gypfile": true,
  "install": "node-gyp-build || node-gyp rebuild",
  "binary": { "napi_versions": [9], "module_path": "build/Release" }
}
```

```python
# providers/macos/binding.gyp
{
  "targets": [{
    "target_name": "dsh_computer_use_macos_native",
    "sources": ["src/provider.mm"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
    "defines": ["NAPI_CPP_EXCEPTIONS"],
    "xcode_settings": {
      "MACOSX_DEPLOYMENT_TARGET": "13.0",
      "OTHER_LDFLAGS": [
        "-framework ApplicationServices",
        "-framework CoreGraphics",
        "-framework AppKit",
        "-framework CoreFoundation",
        "-framework Carbon"
      ]
    },
    "conditions": [
      ["target_arch=='arm64'", { "xcode_settings": { "ARCHS": ["arm64"] } }],
      ["target_arch=='x64'",  { "xcode_settings": { "ARCHS": ["x86_64"] } }]
    ]
  }]
}
```

预编译发布矩阵：

| 平台 | arch | 预编译文件 |
|---|---|---|
| darwin | arm64 | `darwin-arm64/dsh_computer_use_macos_native.node` |
| darwin | x64 | `darwin-x64/dsh_computer_use_macos_native.node` |

---

## 七、Linux 版本

包名：`dsh-computer-use-linux`，明确拆成两种后端。

### 7.1 后端选择（helper vs N-API）

| 方案 | 优点 | 缺点 |
|---|---|---|
| Node-API addon（同 Windows） | 部署简单、一个 .node | 发版绑定 Node ABI；崩溃杀死 DSH；D-Bus 初始化和 fork 后 X 连接生命周期难管理 |
| **原生 helper 进程（C/C++，推荐）** | 崩溃隔离；可长驻保持 X 连接；D-Bus 逻辑独立；无需每次调用重新连 X | 多一个部署文件；需要设计进程间通信 |
| Python 脚本 | —— | 用户明确排除 Python |

**结论**：
- **X11**：C++ helper + JSON-lines over stdio（协议简单、可调试）。
- **Wayland**：portal D-Bus 直接走 TypeScript（portal 本身就是 IPC，无需额外 helper）。

**重要**：X11 输入模拟必须在拥有权限的进程中执行。DSH 引擎不以特权用户运行时，helper 进程应以当前用户身份运行，通过 `DISPLAY` / `XAUTHORITY` 连接同一 X server。

### 7.2 X11 后端

| 接口方法 | X11 实现 | 库/协议 |
|---|---|---|
| `listWindows()` | `_NET_CLIENT_LIST` 或 `XQueryTree` 根窗口 | EWMH / Xlib |
| `getWindow(id)` | `XGetWindowProperty(_NET_WM_PID)` + `XGetWindowAttributes` | Xlib |
| `captureWindow(id, path)` | `XComposite` + `XShm` → `XGetImage` → PNG | Xlib / XShm |
| `activateWindow(id)` | `XSendEvent(_NET_ACTIVE_WINDOW)` | EWMH |
| `accessibilityTree(id)` | AT-SPI2（`org.a11y.atspi.Registry`） | D-Bus / AT-SPI |
| `elementClick(id, elId)` | AT-SPI2 `performAction("click")` | AT-SPI |
| `moveCursor(x, y)` | `XWarpPointer` | Xlib |
| `click(req)` | `XTestFakeButtonEvent` | XTest |
| `typeText(req)` | `XTestFakeKeyEvent` per scancode | XTest |
| `pressKey(req)` | `XTestFakeKeyEvent` | XTest |
| `scroll(req)` | `XTestFakeButtonEvent` (button 4/5) + `XTestFakeMotionEvent` | XTest |
| `drag(req)` | `XTestFakeButtonEvent` + `XWarpPointer` + `XTestFakeMotionEvent` | XTest |
| `postClick/postWheel` | 不支持（X11 无 PostMessage 等价物） | — |
| `saveClipboard()` | `CLIPBOARD` selection owner 转存，或 `xclip`/`xsel` | X11 selection |
| `restoreClipboard()` | 重新成为 selection owner | X11 selection |
| `setClipboardText()` | `XSetSelectionOwner` + 响应 `SelectionRequest` | Xlib |
| `getClipboardText()` | `XConvertSelection` + 等待 `SelectionNotify` | Xlib |
| `overlayCreate/Show/...` | override-redirect 透明窗口 + 合成器 alpha | Xlib / XComposite |
| `launchApp(req)` | desktop entry（`gio launch`）或直接 spawn | GLib / spawn |

### 7.3 X11 helper 协议

```
channel: stdio (stdin/stdout), JSON lines（一次一对象，UTF-8）

请求示例：
  {"id": 1, "method": "listWindows"}
  {"id": 2, "method": "getWindow", "windowId": "x11:xid:0x03400007"}
  {"id": 4, "method": "captureWindow", "windowId": "x11:xid:0x03400007", "path": "/tmp/foo.png"}
  {"id": 6, "method": "click", "button": "left", "count": 1}
  {"id": 11, "method": "accessibilityTree", "windowId": "x11:xid:0x03400007", "maxNodes": 2000, "maxDepth": 32}
  {"id": 16, "method": "saveClipboard"}
  {"id": 23, "method": "runtimeInfo"}
  {"id": 24, "method": "capabilities", "backend": "x11"}

响应示例：
  {"id": 1, "ok": true, "value": [...]}
  {"id": 1, "ok": false, "code": "X11_CONNECTION_FAILED", "message": "...", "recovery": "RETRY"}
```

helper 生命周期：

- 由 Node provider 懒启动（首次调用）。
- 常驻（避免每次调用重新 `XOpenDisplay`）。
- helper 异常退出时，provider 在下一次调用自动重启并打 warning。
- `dispose()` 或进程退出（SIGTERM）时退出。

### 7.4 X11 截图（合成器问题——最高技术风险）

很多现代合成器（GNOME Mutter、KDE KWin）默认启用 compositing，此时窗口内容在合成器侧的 backing pixmap 中，`XGetImage` 只能截到窗口 frame/decoration。

```cpp
// 复合窗口截图逻辑
static bool captureCompositedWindow(Display* dpy, Window w, const char* path) {
  int xc_evt = 0, xc_err = 0;
  if (!XCompositeQueryExtension(dpy, &xc_evt, &xc_err)) {
    return captureRawWindow(dpy, w, path); // fallback
  }
  Pixmap pm = XCompositeNameWindowPixmap(dpy, w);
  if (!pm) return captureRawWindow(dpy, w, path);
  XImage* img = XGetImage(dpy, pm, 0, 0, w, h, AllPlanes, ZPixmap);
  // ... encode PNG
  XFreePixmap(dpy, pm);
  return true;
}
```

必须作为 contract test 覆盖（Xvfb + 一个 compositor）。

### 7.5 X11 剪贴板

X11 selection 没有"快照/恢复"原生概念：内容由 selection owner 进程提供，owner 退出内容即消失。

- `saveClipboard`：`XGetSelectionOwner(CLIPBOARD)` → `XConvertSelection(TARGETS)` → 请求各 target → 序列化存储。
- `restoreClipboard`：重新成为 owner，响应后续 `SelectionRequest`。
- `UTF8_STRING` 是基准 target；复合内容（图像/文件列表）依赖 `text/uri-list`。

**对 `typeText` 的影响**：
- 剪贴板粘贴可能不被所有应用支持（Electron 支持，GTK 终端接受，老 Qt/Java 可能不行）。
- 需保留回退路径：`XTestFakeKeyEvent` 逐字符。
- X11 的 keysym 局限：非 ASCII（尤其 CJK）无法简单注入，应优先剪贴板粘贴，并在 `limitations` 中注明。

### 7.6 AT-SPI2 辅助功能树

- AT-SPI2 是 D-Bus 服务（`org.a11y.atspi.Registry`）。
- 输入要求 app 自启辅助功能（很多 GTK/Qt 默认关闭），检测不出来时给 `accessibilityTree: false` 而不是抛错。
- 与 macOS AX 的根本差异：macOS 是主动连接（`AXUIElementCreateApplication(pid)`），AT-SPI 是被访问机制（app 主动暴露）。

**ElementId（X11）**：
- 不能用 UIA 索引（树随时变）。
- 建议用 AT-SPI path（如 `/org/a11y/atspi/...`）作为稳定标识，绑定 observation。

### 7.7 X11 目标支持

- Ubuntu/Debian。
- Fedora。
- Arch 系列。
- Xvfb 测试环境。
- 多显示器和负坐标（EWMH 虚拟坐标）。
- 窗口管理器差异（GNOME/KDE 的 `_NET_ACTIVE_WINDOW` 行为差异）。

### 7.8 Wayland 后端（受限兼容模式）

Wayland 不能直接读取全部窗口，也不能任意模拟全局输入。

#### 建议使用

- `xdg-desktop-portal`
- RemoteDesktop portal
- ScreenCast portal
- AT-SPI2
- `xdg-open` 或 desktop entry

#### 限制必须显式暴露

- 不能保证全局窗口枚举。
- 窗口截图通常需要用户选择来源。
- 后台输入通常不可用。
- overlay 不能保证覆盖所有桌面。
- XWayland 只覆盖 X11 应用。
- 剪贴板恢复能力取决于 compositor 和 portal。

Wayland 初期定位为 `受限兼容模式`，不宣称"完整桌面控制"。

#### 检测逻辑

1. 检查 `XDG_SESSION_TYPE`。
2. 检查 portal 是否可用。
3. 检查 AT-SPI 是否可用。
4. 检查 RemoteDesktop 是否支持。
5. 根据检测结果生成 capabilities。
6. 在工具描述或返回值中声明限制。

**不要在 Wayland 下偷偷退回 X11**，除非明确存在可用的 X11 session 且用户授权。

---

## 八、原生实现策略

```text
Windows:  当前 Node-API addon    预编译 Release .node + node-gyp rebuild 兜底
macOS:    Objective-C++ Node-API addon（binding.gyp 链接 ApplicationServices/CoreGraphics/AppKit）
Linux:    X11 → C/C++ helper 进程；Wayland → portal helper
```

### Windows

- 保持当前 C++ Node-API provider。
- 保持预编译 Release `.node`。
- 缺少预编译文件时自动 `node-gyp rebuild`。
- 不新增 Windows 用户的安装步骤。

### macOS

- 使用 Objective-C++ Node-API provider。
- 提供 `darwin-arm64` 和 `darwin-x64` 预编译包。
- 没有预编译包时要求 Xcode Command Line Tools。
- 原生 provider 加载失败时返回明确的安装提示。

### Linux

- 优先使用独立 provider helper（发行版差异大，进程隔离便于崩溃隔离、处理 D-Bus 和生命周期）。
- X11 依赖动态检测并返回缺失库名称。
- Wayland 使用 portal helper，避免把 compositor 细节塞进 Node addon。
- 不依赖 Python。
- 是否需要额外系统包必须在启动诊断中明确列出。

---

## 九、包和安装设计

三个包都使用平台限制：

```json
{ "os": ["win32"] }
{ "os": ["darwin"] }
{ "os": ["linux"] }
```

### Windows 包（dsh-computer-use）

- 继续叫 `dsh-computer-use`。
- 保持当前 `native/build/Release/*.node` 发布内容。
- 保持 node-gyp 自动构建兜底。
- 不依赖 macOS/Linux 包。

```json
{
  "name": "dsh-computer-use",
  "version": "0.2.0",
  "type": "module",
  "dependencies": {
    "dsh-computer-use-core": "^0.2.0",
    "dsh-computer-use-native": "file:native"
  },
  "os": ["win32"]
}
```

Windows 包 `index.ts` 变成薄 wrapper：

```ts
import { WindowsProvider } from 'dsh-computer-use-core/providers/windows'
import { defineTools, registerComputerUseRpc } from 'dsh-computer-use-core'

export const name = 'dsh-computer-use'
export const inject = ['tools', 'settings', 'attachments', 'approval', 'connection']

export function apply(ctx: Context): void {
  const provider = new WindowsProvider()
  const scope = ctx.settings.register(...)
  ctx.effect(() => registerComputerUseRpc(ctx, scope))
  ctx.effect(() => {
    const disposers = defineTools(ctx, scope, provider)
    return () => { for (const d of disposers) d(); provider.dispose() }
  })
}
```

### macOS 包（dsh-computer-use-macos）

- 发布 arm64 和 x64 provider。
- 支持 prebuild 优先。
- 本地编译作为开发者兜底。

### Linux 包（dsh-computer-use-linux）

- 根据架构发布 x64、arm64。
- provider 运行时检测 X11/Wayland。
- 缺少系统库时输出可操作诊断。

### 公共 core 包（dsh-computer-use-core）

```json
{
  "name": "dsh-computer-use-core",
  "version": "0.2.0",
  "type": "module",
  "files": ["lib/", "src/"],
  "engines": { "node": ">=22.19.0" },
  "dependencies": {
    "@deepseek-ai/cordis": "peer",
    "@deepseek-ai/dsh-tools": "peer",
    "@deepseek-ai/dsh-settings": "peer",
    "@deepseek-ai/dsh-user-approval": "peer",
    "@deepseek-ai/dsh-llm": "peer",
    "@deepseek-ai/dsh-attachment": "peer",
    "@deepseek-ai/dsh-client-connection": "peer",
    "@deepseek-ai/dsh-client-runtime": "peer",
    "@deepseek-ai/dsh-host-apiproxy": "peer",
    "@deepseek-ai/schemastery": "peer"
  }
}
```

纯 TypeScript，不含 Win32、AppKit、X11 或 Wayland 依赖。

Core 导出结构：

```ts
export * from './types.ts'
export * from './errors.ts'
export * from './observation.ts'
export * from './protection.ts'
export * from './permissions.ts'
export * from './approval.ts'
export * from './overlay.ts'
export * from './clipboard.ts'
export * from './identity.ts'
export * from './capability.ts'
export { defineTools } from './tools.ts'
```

---

## 十、测试计划

### Core contract tests

- observation 创建、过期和淘汰。
- 窗口身份变化。
- 尺寸变化。
- UI 树 checksum 变化。
- 权限撤销。
- 审批拒绝。
- 审批等待期间权限撤销。
- 非法窗口和非法元素 ID。
- capability 缺失时的错误。
- action 返回格式。

### Windows

- Win32 窗口枚举。
- UIA 树。
- HWND 重用。
- DPI 和多显示器。
- 剪贴板富内容恢复。
- overlay 不抢焦点。
- Release provider 安装加载。
- 没有预编译 provider 时自动编译。

### macOS

- Intel 和 Apple Silicon。
- Accessibility 权限缺失。
- Screen Recording 权限缺失。
- AX 树。
- CGWindow 截图。
- 输入法和非 ASCII 文本。
- 多显示器。
- TCC 权限撤销后的行为。
- NSPanel 不抢焦点。

### Linux X11

- Xvfb。
- 真机桌面。
- XTest 输入。
- AT-SPI 树。
- X11 clipboard selection。
- 多显示器和负坐标。
- 窗口管理器差异。

### Linux Wayland

- GNOME Wayland。
- KDE Wayland。
- Weston 测试环境。
- portal 授权取消。
- RemoteDesktop 不可用。
- ScreenCast 来源选择。
- 不支持窗口枚举时的错误语义。

### 打包测试

- 每个平台 clean install。
- `npm pack --dry-run`。
- 校验不会安装错误平台的 native 文件。
- 校验预编译 provider 优先。
- 校验 node-gyp 只作为 fallback。
- 校验 DSH peer 依赖不会被错误清理。

---

## 十一、实施顺序

### 阶段 0：基线和清理

- 修复中文编码乱码。
- 提取 Windows contract tests。
- 确定错误码和 capability schema。
- 冻结现有 Windows 工具行为。

### 阶段 1：抽取 core

- 拆出 observation、approval、permission、tool contract。
- 引入 `DesktopProvider`。
- Windows provider 先作为唯一实现。
- 所有现有 Windows 测试通过后再继续。

### 阶段 2：拆包但不改体验

- 生成 `dsh-computer-use-core`。
- 保留 `dsh-computer-use` 作为 Windows 包。
- Windows 包继续开箱即用。
- 验证现有 profile 安装和运行流程不变。

### 阶段 3：macOS

- 实现窗口、截图、AX、CGEvent、剪贴板。
- 完成权限引导。
- 发布 `dsh-computer-use-macos` alpha。
- 先支持前台控制，再补语义操作和 overlay。

### 阶段 4：Linux X11

- 实现窗口枚举、截图、XTest、AT-SPI。
- 支持常见桌面环境。
- 发布 `dsh-computer-use-linux` X11 alpha。

### 阶段 5：Wayland

- 接入 portal。
- 引入 capability 降级。
- 明确限制并完善用户提示。
- 不把 Wayland 标记为完整能力，直到窗口和输入语义稳定。

### 阶段 6：正式发布

- Windows 继续稳定版。
- macOS 发布 arm64/x64 稳定版。
- Linux 发布 X11 稳定版。
- Wayland 作为受限兼容模式发布。
- 建立 Windows、macOS、Linux 独立 CI 和版本发布流程。

---

## 十二、版本策略

不建议给三个包使用完全不同的工具协议。建议：

```text
dsh-computer-use       0.2.x   Windows stable
dsh-computer-use-macos 0.1.x   macOS alpha/beta
dsh-computer-use-linux 0.1.x   Linux X11 alpha/beta
```

共享 core 使用独立版本：

```text
dsh-computer-use-core 0.2.x
```

Windows 的优先级是"零额外步骤"。macOS/Linux 可以要求系统权限和图形环境配置，但必须在错误信息中给出具体原因、检测结果和解决路径。

---

## 附：阶段 0 先行清单（可立即开工）

1. **错误信息统一**：所有运行时错误 message 改为英文 code-first，保留错误码不变。
2. **Contract tests 骨架**：建立 `tests/contracts/`，覆盖 observation 生命周期、保护逻辑、坐标转换、错误格式。
3. **capability schema 定型**：先在 core 层定义为纯 TS 类型，Windows provider 暂时只返回 `true`/`'limited'` 对应值。
4. **WindowId 类型切换**：引入 `resolveWindowId` / `extractLegacyHwnd`，tools 层先接受 `number | string`，Windows provider 内部继续用 HWND。
5. **ElementId 预留**：新建 `ElementRef`（elementId + observationId + checksum），Windows 继续用 `elementIndex` 兼容字段，新字段留空。
---

## 附：阶段 0 实施进度（已落地）

| 项 | 状态 | 说明 |
|---|---|---|
| 错误信息统一 | ✅ | `runtime.ts` 运行时错误 message 已改为英文 code-first（错误码不变）；overlay 文案保留 i18n。 |
| Contract tests 骨架 | ✅ | 建立 `tests/contracts/`，共 37 个用例，覆盖错误格式、品牌保护、坐标转换、WindowId/ElementRef/capability、provider 接口、observation 生命周期。 |
| capability schema 定型 | ✅ | `src/core/capability.ts` 定义 `Capabilities` / `CapabilityState`，`windowsCapabilities()` 返回 Windows 全能力。 |
| WindowId 类型切换 | ✅ | `src/core/identity.ts` 提供 `resolveWindowId`/`extractLegacyHwnd`/`parseWindowId`；tools 层 `resolveHwnd` 接受 `number | string`。 |
| ElementId 预留 | ✅ | `src/core/observation-element.ts` 定义 `ElementRef`（elementId+observationId+checksum），`elementIndex` 保留为兼容字段。 |
| core 抽取 | ✅ | `src/core/` 新增 `errors/identity/capability/protection/point/observation-element`，纯逻辑无 native 依赖。 |

运行契约测试：`npm run test:contract`（Node 24 类型剥离）。

---

## 附：阶段 1+ 代码骨架（先编写，未在目标平台验证）

> 依据“先写了”的指示，以下内容已在源码层落地；macOS/Linux 原生部分需在对应
> 平台构建/验证后才能宣称可用。

| 项 | 状态 | 说明 |
|---|---|---|
| DesktopProvider 接口 | ✅ | `src/core/types.ts` 定义完整 provider contract（窗口/截图/AX/输入/剪贴板/overlay/launch）。 |
| Observation 生命周期抽取 | ✅ | `src/core/observation.ts` 依赖 `DesktopProvider` 接口，可用 mock 测试过期/窗口不匹配/品牌保护/树变化。 |
| Windows provider | ✅ | `src/providers/windows/provider.ts` 实现 `DesktopProvider`，内部继续用 HWND，外部用 `win:hWnd:` 字符串。 |
| macOS provider 骨架 | ✅ | `src/providers/macos/provider.ts` + `permissions.ts`/`clipboard.ts`/`overlay.ts` + `native.d.ts` ambient 声明 + `binding.gyp`。原生实现 TODO(macos-native)。 |
| Linux X11 provider 骨架 | ✅ | `src/providers/linux/detection.ts` + `x11/provider.ts`（JSON-lines helper 客户端）。helper 二进制待构建。 |
| Linux Wayland provider 骨架 | ✅ | `src/providers/linux/wayland/provider.ts` 受限兼容模式，显式暴露能力限制。 |
| Provider 入口 | ✅ | `src/providers/index.ts` 按平台创建 provider。 |
| Packages 骨架 | ✅ | `packages/` 下 core/macos/linux 三个 package.json 占位，阶段 2 拆包时启用。 |

运行契约测试：`npm run test:contract`（当前 37 个用例全绿）。

### 原生实现草案（已编写，未在目标平台编译验证）

按“先写了”的指示，以下原生代码也已在仓库中落地，待目标平台编译/联调：

| 文件 | 说明 |
|---|---|
| `src/providers/macos/src/provider.mm` | Objective-C++ Node-API addon 草稿：CGWindow 枚举/截图、AX 树、CGEvent 输入、NSPasteboard 文本、NSPanel 占位。 |
| `src/providers/macos/native.d.ts` | macOS addon 的 ambient 类型契约（`dsh-computer-use-macos-native`）。 |
| `src/providers/macos/binding.gyp` | macOS Xcode 构建配置（arm64/x64、ARC、系统框架）。 |
| `src/providers/linux/x11/helper.c` | C 语言 helper：Xlib/XTest/EWMH + zlib PNG；JSON-lines CLI 协议。 |
| `src/providers/linux/x11/Makefile` | helper 构建脚本（`-lX11 -lXtst -lXext -lz`）。 |
| `src/providers/linux/wayland/portal.ts` | xdg-desktop-portal 的 gdbus 客户端骨架（会话创建/可用性检测；fd 传递 TODO）。 |

> 这些文件不会影响 Windows 构建（tsc 只编译 TS），但需要 macOS/Linux 环境完成
> 真实编译验证。

### 继续补充的 core 模块与工程骨架

| 项 | 说明 |
|---|---|
| `src/core/actions.ts` | 平台无关动作包装：click/typeText/pressKey/scroll/drag 统一校验后调 provider。 |
| `src/core/approval.ts` | `ApprovalGate` 审批抽象（宿主注入 requester）。 |
| `src/core/permissions.ts` | `PermissionGate` allowControl 权限门。 |
| `src/core/overlay.ts` | 跨平台 overlay 状态机（show/hide/auto-idle 策略）。 |
| `src/core/clipboard.ts` | 剪贴板 save/restore 包装（paste 前后恢复）。 |
| `src/core/tools.ts` | 9 个 `computer_*` 工具定义工厂（宿主实现 handlers）。 |
| `src/providers/macos/browser.ts` | Safari/Chrome/Firefox 的 new-window 参数适配。 |
| `src/providers/macos/keymap.ts` | Apple HID 虚拟键码映射表。 |
| `.github/workflows/ci.yml` | Windows/macOS/Linux 三平台 CI 矩阵（core 测试 + 平台构建）。 |
| `scripts/package-check.mjs` | 打包检查：Windows 包不得携带 mac/linux 原生源码。 |

当前 `npm run test:contract`：45 个用例全绿。

## 附：静态审查与修复记录（PR 前）

| 问题 | 修复 |
|---|---|
| `WindowsProvider.pressKey` 委托旧 runtime 且未传 observation，必然失败 | 在 provider 内实现完整 Windows 键码映射 + native 按键收发 |
| `WindowsProvider` 多处 `activateWindow` 未 `await` | 改为 `await this.activateWindow(...)` |
| `linux/x11/helper.c` `method_press_key` 越界读内存 | 重写为基于 `strtok_r` 的 chord 解析，支持数字键码/keysym/修饰键别名 |
| `linux/x11/helper.c` `json_field` 只支持字符串值，数字参数（x/y/scroll）全部失效 | 重写为支持 `"name":123` / `true` / `false` |
| `macos/provider.mm` `WindowInfo` 返回悬垂指针（UAF） | 返回 `CFBridgingRelease(CFRetain(...))` 安全持有 |
| `macos/provider.mm` `Click` 创建的 `CGEventCreate(NULL)` 未释放 | 补 `CFRelease` |
| 平台混淆：Windows 包发布内容会携带 mac/linux provider JS/源码 | `package.json files` 排除整个 `lib/providers/**`/`lib/types/providers/**`/`packages/**`；`package-check.mjs` 强制校验 |
| `package-check.mjs` 在 Windows 下 `npm` spawn 失败 | 改用 `cmd.exe /c npm pack` 并消除 deprecation 警告 |
| Wayland provider capabilities 宣称可用但方法抛错（accessibilityTree/semanticClick 等） | 将未实现能力标为 `false`，与行为一致 |
| 未使用变量/导入 | 清理 `core/actions.ts`、`windows/provider.ts`、`core/observation.ts` |

当前验证：build / typecheck / 45 contract tests / package-check 全部通过。

## 发布状态（重要）

- **当前可发布平台：仅 Windows 10/11 x64。**
- macOS / Linux 的 provider、原生 addon/helper 均为 **unpublished draft**：
  - 未在 macOS/Linux 编译验证；
  - 未通过真实桌面输入、焦点竞争、截图泄露、窗口复用、剪贴板并发和跨 session E2E 测试；
  - 不提供对应安装包（`packages/` 仅为占位）。
- 三平台能力标记：凡未实现/未验证的能力在 `capabilities()` 中一律返回 `false`，
  不允许“宣称可用但实际 stub”。
- 发布门禁：P0/P1 修复 + 三平台真实运行测试通过后，才允许将 macOS/Linux 标记为支持。

## 附：BLOCK 审查后的修复补充

针对“三阶段、三平台”发布审查，本次补充修复：

| 审查项 | 修复 |
|---|---|
| Linux helper `json_escape` 非编译（坏字符常量、`\u` 非法转义） | 重写为合法 C 转义（`\"`/`\`/`\n`/`\u%04x`） |
| `json_field` 静态 buffer 互覆 | 改为调用者传入 buffer，main 为每个字段独立声明 |
| X11 `click` 忽略坐标 | helper 点击前 `XTestFakeMotionEvent` 到目标坐标；provider 先做窗口相对→屏幕转换 |
| X11 helper 主循环无 `launchApp` | 改为 provider 层 Node `spawn`，不再依赖 helper |
| X11 允许 Super/Cmd/系统键 | provider pressKey 禁止 win/meta/super/cmd/command；helper 支持 ctrl/shift/alt 别名 |
| X11 文本静默丢弃非 ASCII | `typeText` 遇到非 ASCII 返回 `UNSUPPORTED_TEXT`，不再假装成功 |
| `read_line` 无上限/分配失败 | 增加 1MB 上限与 realloc 失败保护 |
| X11/Wayland capabilities 虚标 | 未实现能力全部 `false`（tree/semantic/clipboard/overlay） |
| macOS `toScreenPoint` 坐标错误 | 通过 native getWindow rect 做窗口相对→屏幕转换 |
| macOS capabilities 虚标 | semanticClick/clipboard/overlay 改为 `false` |
| macOS Unicode 输入损坏 | 用 NSString UTF-8→UTF-16 再 `CGEventKeyboardSetUnicodeString` |
| macOS 剪贴板恢复清空用户剪贴板 | 保存文本内容并在恢复时写回 |
| macOS 激活 raise 同应用全部窗口 | 增加 `FindAXWindow` 按 bounds 匹配并只 raise 指定窗口 |
| macOS AX 树按整个应用构建 | 改为从指定窗口的 AX element 开始遍历 |
| 共享 core 无强制 gate | 新增 `core/guard.ts` `GuardedDesktopProvider`，统一 permission/approval/capability 门控 |
| observation ID 用 `Math.random()` | 改用 `crypto.randomUUID()`；core Observation 增加 sessionId/agentId 元数据 |
| Windows 键限制不足（Alt+Tab 等） | runtime 与 WindowsProvider 增加 `FORBIDDEN_CHORDS` 禁用系统组合 |
| `launchApp` 可启动 shell/脚本宿主 | Windows/Linux provider 增加危险应用黑名单 |
| 平台发布状态不明确 | README/docs 明确“仅 Windows 可发布，macOS/Linux 为 unpublished draft” |

当前验证：build / typecheck / 48 contract tests / package-check 通过。
