# dsh-computer-use

DSH 桌面控制插件：让 DSH Agent 像 Codex Computer Use 一样操作 Windows 桌面——列出窗口、截图、读取 UI Automation 元素树、模拟鼠标/键盘。

架构复刻自 Codex Computer Use：

```
DSH 模型
  ↓ 调用 computer_* 工具
dsh-computer-use (Node/Cordis)
  ↓ JSON-RPC over stdio
python/computer_use_helper.py
  ↓ UI Automation + SendInput + mss
Windows 窗口 / 鼠标 / 键盘
```

## 功能

- `computer_list_apps`：列出可操作的窗口
- `computer_get_window_state`：截图（保存为 DSH 附件）+ 可访问性 UI 树
- `computer_activate_window`：激活窗口
- `computer_click`：按元素索引或窗口坐标点击
- `computer_type_text`：输入文本（支持中文，剪贴板粘贴）
- `computer_press_key`：发送组合键（如 `Control_L+a`、`Control_L+Shift_L+Tab`、`Return`、`F5`、`F1`-`F24`；多修饰键组合精确按下/释放）
- `computer_scroll`：滚动
- `computer_drag`：拖动
- `computer_launch_app`：启动应用
- 控制指示 UI：控制期间屏幕四周显示蓝色高亮边框，顶部显示“DSH 正在控制你的电脑”小蓝条，鼠标指针切换为蓝色 DSH 光标（截图时会临时隐藏，避免干扰视觉模型）
- 授权气泡：DSH 聊天输入框正上方右侧有一个小气泡“点击授权DSH控制”，打勾前插件**无权**控制电脑；打勾后才有权（通过插件自己的 `/computer-use` 回环 RPC 通道读写，不依赖宿主设置白名单）

## 依赖

- Windows 10/11
- Python 3.10+（已测试 3.13）
- Python 包：

  ```bash
  pip install uiautomation mss pillow
  ```

## 安装（DSH web profile）

1. 把本目录放到 `~/.dsh/plugins/dsh-computer-use`。
2. 在 `~/.dsh/profiles/web/package.json` 的 `dependencies` 加（把 `<用户名>` 换成你自己的 Windows 用户名）：

   ```json
   "dsh-computer-use": "link:C:/Users/<用户名>/.dsh/plugins/dsh-computer-use"
   ```

3. 在同一个文件的 `dsh.profile.bundles` 加 `"dsh-computer-use"`。
4. 在 `~/.dsh/profiles/web` 执行：

   ```bash
   dsh plugin --profile web install
   ```

5. 重启 DSH。

> 本插件仅支持 Windows（依赖 UI Automation）。macOS / Linux 上会因缺少 Python 依赖而无法工作。

## 配置

```yaml
# ~/.dsh/settings.yaml
computer-use:
  enabled: true
  pythonBin: python        # Python 解释器路径
  timeoutMs: 120000
  requireApproval: true    # 高风险操作（点击/输入/启动）先征求用户同意
  skipApprovalWhenPolicyNever: true  # 会话策略为“不再询问”(never) 时跳过交互审批，仅由 allowControl 把关；
                                     # 设为 false 则遵循官方 fail-closed 语义（此类操作会被拒绝）
  screenshotDir: computer-use/screenshots
  overlayEnabled: true     # 控制时显示蓝色高亮 + 顶部提示 + 自定义鼠标
  overlayIdleMs: 10000     # 最后一次操作后多久自动隐藏指示
  overlayText: DSH 正在控制你的电脑
  overlayColor: '#2563EB'  # 蓝色高亮色
  allowControl: false      # 授权开关（默认关闭！气泡打勾后才允许控制）
  permissionWidgetEnabled: false  # 旧的桌面悬浮窗默认关闭，改用 DSH 内嵌气泡；
                                  # 若开启，悬浮窗勾选状态也会参与门禁（双通道都需放行）
```

## 配合视觉模型

主模型（如 DeepSeek）不能看图时，让 Agent：

1. `computer_list_apps` 选窗口
2. `computer_get_window_state` 截图（返回图片附件和 `screenshotPath`）
3. `vision_analyze`（来自 `dsh-vision-model`）传 `imagePath=screenshotPath` 分析截图
4. 根据分析结果再调用 `computer_click` / `computer_type_text` 等
5. 每次动作后**必须**重新 `computer_get_window_state` 刷新（元素索引和坐标只对当次有效）

## 安全

- 默认 `requireApproval: true`，点击、输入、启动等操作会请求用户确认
- 禁止发送 Windows/Meta 键
- 工具描述中不建议操作终端、密码框、安全设置和锁屏
- 截图使用 `mss` 截取窗口矩形，被完全遮挡的窗口可能截不到
- **硬性安全限制（不可关闭）**：禁止对 DSH 聊天窗口（DeepSeek Harness）进行点击/输入/按键/滚动/拖动，防止覆盖正在进行的对话；识别基于窗口标题/类名启发式 + 已识别句柄记忆（一次命中后该窗口永久拦截），浏览器窗口只有标题含 dsh/harness/deepseek 关键词时才会被拦，请勿把 DSH 页签切到无关标题的页面上；启动浏览器时插件自动强制 `--new-window`，保证新开窗口
- 点击/滚动/拖动的坐标会校验在窗口矩形内，越界直接报错，不会点到其他窗口

## 开发

```bash
npm install
npm run typecheck
npm run build
```

## License

BSD-3-Clause
