# 没有 macOS / Linux 实机时的开发与验证策略

本仓库的 Windows provider 可以在本机直接编译运行，但 macOS（`provider.mm`、
`dsh-computer-use-macos-native`）与 Linux（`helper.c`、X11/AT-SPI/portal）的原生
代码无法在 Windows 工作站上编译。下面是三套互补的验证路径。

## 1. 分层验证原则

| 层 | 能否在 Windows 本地验 | 验证手段 |
|---|---|---|
| 纯 TS core（observation/guard/approval/capability/identity） | ✅ | `npm run test:contract` |
| provider 的 TS 逻辑（capabilities、detection、keymap、禁止快捷键） | ✅ | `tests/contracts/platform-providers.test.ts`（原生模块懒加载，可在任何平台跑） |
| 原生层逻辑（C++/ObjC++ 能本地编的） | ✅ | `npm run test:native`（仅 Windows addon） |
| macOS 原生 addon | ❌ | GitHub Actions `macos-latest` runner |
| Linux helper + X11/AT-SPI | ❌（除非 WSL2） | GitHub Actions `ubuntu-latest` runner，或 WSL2（见第 3 节） |

关键设计保障：三个 provider 都把原生模块做**懒加载**（构造对象与读取
`capabilities()` 不触碰 OS），因此 `platform-providers.test.ts` 能在 Windows 上
直接回归 macOS/Linux provider 的纯逻辑，这是没有实机时的第一道哨兵。

跑法：

```bash
npm run typecheck
npm run test:contract   # 现含 69 个测试，含跨平台 provider 逻辑
```

## 2. 官方验证通道：GitHub Actions（推荐）

仓库已配 `.github/workflows/ci.yml`，四个 job 分别用官方托管的 runner：

- `core`：`ubuntu-latest`，typecheck + contract tests。
- `windows`：`windows-latest`，完整 build + 测试 + `npm pack --dry-run`。
- `macos`：`macos-latest`，typecheck + contract tests +（草稿期非致命的）
  `npm --prefix src/providers/macos run build` 真实编译 `provider.mm`。
  等它编译全绿后把 `continue-on-error: true` 移除。
- `linux`：`ubuntu-latest`，apt 装 X11/xvfb，`make` 编译 helper，
  `node --experimental-strip-types scripts/x11-smoke.mjs` 对 Xvfb 做端到端烟测
  （真实 JSON-lines IPC：listWindows / getWindow 缺失窗口报错 / launchApp / dispose）。

即使本地没有 macOS/Linux，每次 push/PR 都由云 runner 验证原生代码。macOS
runner 免费额度对公开仓库充足；私有仓库按
[GitHub Actions 计价](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions)
计费。

## 3. 本地 Linux：WSL2（可选，性能与迭代更快）

WSL2 是跑在 Windows 上的真实 Linux 内核，可编译与运行 X11 helper 和整套
contract tests（AT-SPI/临利测试除外）。

### 3.1 安装发行版

```powershell
wsl --install -d Ubuntu        # 首次会提示重启；之后设置 Linux 用户名/密码
wsl --set-default-version 2
```

若 `wsl --install` 缺组件，参考 https://aka.ms/wslinstall。

### 3.2 在 WSL 里准备工具链与服务

```bash
# 进入工作区（从 Windows 侧访问 D 盘）
cd /mnt/d/DSH_WORKSPACE/plugins/dsh-computer-use-pr/dsh-computer-use

sudo apt update
sudo apt install -y build-essential libx11-dev libxtst-dev libxext-dev \
  zlib1g-dev xvfb nodejs npm
# 或只装 Node 24 的官方包更好：https://nodejs.org 的 LTS

# 可选：Wayland 后端调试（Weston 可跑在 Xvfb 之上）
sudo apt install -y weston
```

> 提示：跨 `/mnt/d` 磁盘的 npm/node_modules 性能差。若常做大文件构建，
> 建议把仓库 clone/拷贝到 WSL 家目录（`~/dsh-computer-use`）再开发。

### 3.3 编译并烟测 X11 helper

```bash
make -C src/providers/linux/x11
node --experimental-strip-types scripts/x11-smoke.mjs
```

`scripts/x11-smoke.mjs` 自带 Xvfb 启动逻辑：会在 `:99` 起虚拟屏、spawn helper、
校验 `listWindows` 返回数组、缺失窗口必须报错、`launchApp` 与 `dispose` 正常。

### 3.4 跑完整 contract tests

```bash
npm install --ignore-scripts   # helper 已编译，不需要 node-gyp
npm run typecheck
npm run test:contract
```

### 3.5 Wayland 受限模式（骨架）

WaylandProvider 当前只实现 launchApp，其余能力全部显式关断。Weston 调试：

```bash
export XDG_RUNTIME_DIR=/tmp/xdg
mkdir -p $XDG_RUNTIME_DIR && chmod 700 $XDG_RUNTIME_DIR
weston --backend=headless &
export XDG_SESSION_TYPE=wayland WAYLAND_DISPLAY=wayland-0
node --experimental-strip-types tests/contracts/platform-providers.test.ts  # detection 用例
```

## 4. 兜底：把 provider 原生行为固化成契约

即使本机跑不了原生层，也不要让原生层"悬空"。原则：

1. 原生代码保持**单一职责 + JSON/纯函数风格**，便于在对应 OS 上做黑盒烟测。
2. 每次新增原生能力，同时在 `scripts/` 加一个可在一个 runner 上执行的黑盒脚本
   （参照 `scripts/x11-smoke.mjs`）：macOS 需要 `scripts/darwin-smoke.mjs`
   （用 `npm --prefix src/providers/macos run build` 后加载 addon，测
   listWindows/runtimeInfo/权限检测）。
3. 原生调用失败必须抛出带 `recovery` 的 `ComputerUseError`，不得静默返回成功
   （现有 provider 已遵守）。

## 5. 结论

- **日常迭代**：Windows 本地跑 `npm run test:contract`（69 用例）回归全部纯逻辑。
- **macOS/Linux 原生**：交给 GitHub Actions 的 `macos-latest` / `ubuntu-latest`
  跑编译+烟测；本地改动前先想好能否用一张 Xvfb 或一个 addon load 烟测表达。
- **想要本地真 Linux**：装 WSL2（第 3 节），10 分钟内可编译 helper 并跑通
  Xvfb 端到端。