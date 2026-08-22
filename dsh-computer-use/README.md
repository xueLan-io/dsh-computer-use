# dsh-computer-use

DSH 桌面控制插件：让 DSH Agent 像 Codex Computer Use 一样操作 Windows 桌面。插件是 Node.js 原生运行时，不需要 Python、pip 或外部 sidecar。

架构复刻自 Codex Computer Use：

```
DSH 模型
  ↓ 调用 computer_* 工具
dsh-computer-use (Node/Cordis)
  ↓ Node native runtime
dsh-computer-use-native + Win32/UI Automation
  Windows 窗口 / 鼠标 / 键盘
```

## 平台支持状态

> **当前仅 Windows 10/11 x64 是可发布平台。**
> macOS 与 Linux 的 `DesktopProvider`、原生 helper/addon 属于**未发布草案**
> （见 `docs/CROSS_PLATFORM_PLAN.md` 阶段 3-5），尚未在目标平台编译/运行验证，
> 也没有对应的可安装发布包。不要在生产环境中把 macOS/Linux 视为“已支持”。

## 功能

- `computer_list_apps`：列出可操作的窗口
- `computer_get_window_state`：截图（保存为 DSH 附件）+ 可选 Windows UI Automation 观察快照
- `computer_activate_window`：激活窗口
- `computer_click`：使用最新 observation 的窗口相对坐标点击
- `computer_type_text`：向目标窗口输入文本（优先剪贴板粘贴，兼容忽略 Unicode 注入的控件；粘贴不可用时回退 Unicode 注入）
- `computer_press_key`：发送不包含 Windows/Meta 键的组合键
- `computer_scroll`：使用真实 Windows wheel input 滚动
- `computer_drag`：拖动
- `computer_launch_app`：启动应用
- 控制指示 UI：控制期间屏幕四周显示蓝色高亮边框，顶部显示“DSH 正在控制你的电脑”小蓝条，鼠标指针切换为蓝色 DSH 光标（截图时会临时隐藏，避免干扰视觉模型）
- 授权气泡：DSH 聊天输入框正上方右侧有一个小气泡“点击授权DSH控制”，打勾前插件**无权**控制电脑；打勾后才有权（通过插件自己的 `/computer-use` 回环 RPC 通道读写，不依赖宿主设置白名单）

## 依赖

- Windows 10/11
- Windows 10/11 x64
- Node.js 22.19+
- `dsh-computer-use-native` Windows x64 Node-API provider

Native provider 提供 HWND 窗口枚举、截图、屏幕绝对坐标输入、真实 wheel input 和 Windows UI Automation。UIA 树有节点数和深度边界；截断时会标记 `uiaTruncated`，不会伪造完整树。

## 安装（DSH web profile）

1. 本仓库已经位于 `D:\DSH_WORKSPACE\plugins\dsh-computer-use-pr\dsh-computer-use`，不要复制到运行数据目录。
2. 在 `D:\DSH_HOME\profiles\web\package.json` 的 `dependencies` 加：

   ```json
   "dsh-computer-use": "link:D:/DSH_WORKSPACE/plugins/dsh-computer-use-pr/dsh-computer-use"
   ```

3. 在同一个文件的 `dsh.profile.bundles` 加 `"dsh-computer-use"`。
4. 在 `~/.dsh/profiles/web` 执行：

   ```bash
   dsh plugin --profile web install
   ```

5. 重启 DSH。

> 本插件仅支持 Windows。安装插件依赖后即可运行，不需要安装 Python。

## 配置

```yaml
# D:\DSH_HOME\settings.yaml
computer-use:
  enabled: true
  requireApproval: true    # 高风险操作（点击/输入/启动）先征求用户同意
  skipApprovalWhenPolicyNever: true  # 会话策略为“不再询问”(never) 时跳过交互审批，仅由 allowControl 把关；
                                     # 设为 false 则遵循官方 fail-closed 语义（此类操作会被拒绝）
  screenshotDir: computer-use/screenshots
  overlayEnabled: true     # 控制时显示蓝色高亮 + 顶部提示 + 自定义鼠标
  overlayIdleMs: 10000     # 最后一次操作后多久自动隐藏指示
  overlayText: DSH 正在控制你的电脑
  overlayColor: '#00D9FF'  # 荧光蓝透明辉光边框
  allowControl: false      # 授权开关（默认关闭！气泡打勾后才允许控制）
```

## 配合视觉模型

主模型（如 DeepSeek）不能看图时，让 Agent：

1. `computer_list_apps` 选窗口
2. `computer_get_window_state` 截图和 UIA 快照（返回图片附件、`screenshotPath`、`observationId`）
3. `vision_analyze`（来自 `dsh-vision-model`）传 `imagePath=screenshotPath` 分析截图
4. 根据分析结果调用动作工具，并传入同一次观察返回的 `observationId`
5. 每次动作后**必须**重新 `computer_get_window_state` 刷新（元素索引和坐标只对当次有效）

## 安全

- 默认 `requireApproval: true`，点击、输入、启动等操作会请求用户确认
- 禁止发送 Windows/Meta 键
- 工具描述中不建议操作终端、密码框、安全设置和锁屏
- **硬性安全限制（不可关闭）**：禁止对 DSH 聊天窗口进行点击/输入/按键/滚动/拖动，识别同时使用进程路径、类名、品牌标题和已识别句柄记忆
- 所有动作必须传入未过期的 `observationId`；窗口身份、PID、进程路径或矩形变化都会要求重新观察
- 点击/滚动/拖动的坐标会校验在窗口矩形内，越界直接报错，不会点到其他窗口

## 开发

```bash
npm install
npm run typecheck
npm run build
npm run test:native
```

## License

BSD-3-Clause
