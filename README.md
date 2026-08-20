# dsh-computer-use

DSH Desktop Control plugin for Windows: list windows, screenshot, UI Automation tree, mouse/keyboard control.

> ⚠️ **【重要说明与潜在隐患 / 注意事项】**
>
> 1. **C++ 编译与环境依赖**：
>    - 本项目使用 Node-API（C++）直接调用 Win32 / UI Automation API，**已完全移除 Python 依赖**。
>    - 首次安装需具备 **Windows C++ 生成工具链**（如 Visual Studio Build Tools / MSVC 及 `node-gyp`）。
> 2. **系统平台与架构限制**：
>    - 插件依赖 Win32 原生消息与 UI Automation，**仅支持 Windows 10/11 x64** 操作系统。
> 3. **安全与授权防护机制**：
>    - **授权门禁**：默认不开启控制权限，需在前端界面显式勾选授权。
>    - **DSH 自身防误触保护**：内置硬性安全拦截机制，禁止 Agent 对 DSH 自身的聊天和控制窗口进行点击与按键。
>    - **Observation 时效与熔断**：所有桌面动作均严格绑定 `observationId`，窗口位移或失焦时自动熔断。

详见子目录 `dsh-computer-use/README.md`。

