# dsh Remote SSH

[English](README.md) | 中文

把 SSH 主机作为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中的透明工作区使用。

Remote SSH 同时支持两种模式。远端工作区让 AI 留在本机，通过 AHP 透明路由工具；
Host tunnel 则通过 [dsh-host](https://github.com/Yan-Zero/dsh-host) 让任意协议客户端
接入 SSH 主机上完整、常驻的 Harness。**在 Web 中打开 Backend** 是同一 tunnel
的浏览器入口。

选择 `LOCAL > project` 时，普通文件、搜索、shell 和后台任务工具在本机运行；选择 `<服务器> > project` 时，同一批工具改在对应 SSH 主机上运行。插件不会增加另一套 `remote_*` 工具，远端失败也绝不会回退本机。

## 功能

- 自动读取用户与系统 OpenSSH 配置，包括递归 `Include`，并发现其中的具体主机；
- 在设置页面管理多台 SSH 主机，以及每台主机上的多个工作区；
- 本机和远端使用同一个可编辑目录浏览器；
- 工作区与终端调用显示为 `LOCAL > ...` 或 `<服务器> > ...`；
- 文件系统、搜索、子进程、后台任务和终端都根据当前工作区透明路由；
- 为 `dsh-codex` 生图等制品插件提供二进制工作区写入；原始字节只在 AHP `resourceWrite` 传输内部编码为 base64；
- 远端搜索结果始终使用 POSIX 路径；超长工具结果保存在对应 SSH 主机的私有运行目录，可继续用 `read`/`grep` 分页读取；
- POSIX 远端工作区只显示 `bash`，Windows 本机工作区只显示 `pwsh`；
- 远端文件链接通过本机 VSC 兼容编辑器的 Remote SSH 打开；不可用时下载快照并在本机打开；
- 每台服务器复用一条 SSH/AHP 长连接；每次 Bash 调用像 VS Code 新建终端标签页一样打开独立 channel，不会重新进行 SSH 握手；
- 同一服务器上的多个工作区共享一个 host 级 SSH/AHP 连接；
- 用一条持久 SSH 同时承载 UI 中性的 Backend 启动、认证、HTTP 与 WebSocket 转发；
- 在可选 Web 反向代理之外，独立导出转发后的 Host endpoint 与类型化 Node API client；
- 删除远端映射后保留可阅读的 Workspace 与 Session 历史，但旧会话不能继续调用工具。

远端工作区目前支持 POSIX/Linux 主机，尚未支持 Windows SSH 主机。

## 安装

把已发布 bundle 安装到 Web profile：

```sh
dsh plugin --profile web add dsh-remote-ssh
dsh web
```

本 fork 只面向 Web profile。在 **设置 → Remote SSH** 管理主机和远端工作区，
然后在 `<服务器> > <目录>` 中新建或打开会话。

从 DeepSeek Harness 源码 checkout 运行时，用 `pnpm dsh` 代替 `dsh`。本地开发插件时：

```sh
pnpm install
pnpm run check
pnpm dsh plugin --profile web add link:E:/absolute/path/to/dsh-remote-ssh
pnpm dsh --profile web
```

Codex、Claude Code 及其他自动化 Agent 应直接遵循 [INSTALL.md](INSTALL.md)。它是一份完整且可重复执行的安装 runbook。

## 设置主机

1. 先用普通 OpenSSH 配置并验证主机，推荐使用 SSH Key 或 SSH Agent 认证。
2. 打开 **设置 → Remote SSH**。页面会自动读取平台默认的用户与系统 SSH 配置。
3. 测试主机，然后用 **浏览远端…** 选择工作区目录。
4. 在 `<服务器> > <目录>` 中新建或打开会话。

如需使用非默认配置，在 **设置 → 插件 → Remote SSH → 自定义 SSH 配置文件** 中填写绝对路径。

远端文件链接默认自动选择可用的 VSC 兼容编辑器。也可以在 **设置 → 插件 → Remote SSH → 远端文件打开方式** 中指定编辑器，或始终下载后在本机打开。

远端主机需要：

- POSIX shell，以及可非交互使用的 OpenSSH 连接；
- 用于 shell 和子进程执行的 `bash`、`base64` 与 `mkfifo`；
- 为 glob 和 grep 工具提供的 `rg`；
- 由官方 VS Code CLI 或已有 VS Code Server 提供的 VS Code Agent Host。

完整 Backend 模式不使用 VS Code Server 或 AHP。插件通过同一条 SSH 上传匹配的
`dsh-host` bundle，并在 `~/.dsh-host` 下安装或升级私有、版本化的运行时；后续
连接直接复用。每个远端 OS 用户只运行一个 `dsh-remote-ssh` Host 实例。重连时
通过注册表找到原 PID 和随机 loopback 端口，再经同一条 OpenSSH 动态 SOCKS
通道接入；只有 bundle 变化时才替换实例，并发更新由远端安装锁串行化。所有客户端
连接同一个 Host 协议。点击 **在 Web 中打开 Backend**
只会额外建立服务本机页面的同源反向代理；关闭窗口或 SSH 隧道不会停止远端 Backend。
该窗口会显式标记为完整远端 Backend，因此不会再挂载本机的 Remote SSH 设置、
远端 workspace 选择器和“再次打开 Backend”等入口；普通本地 Web 页面不受影响。

逻辑 Backend 连接独立于一次物理 SSH。SSH 意外断开后会以带抖动的指数退避重建
动态 tunnel，Web gateway URL 保持不变，Host 事件流自动重新订阅。传输中断时无法
安全判断远端是否已执行的 unary mutation 不会自动重放；后续调用会等待重连完成。

首次安装 Backend 还需要 `curl`、`sha256sum`、支持 xz 的 `tar`，以及访问 Node.js
和 npm registry 的网络；安装过程不会修改系统包管理器。

插件会依次检查 PATH 中的 `code`、私有位置 `~/.dsh-remote-ssh/cli/bin/code`，以及主机上已经缓存的兼容 VS Code Server。插件不会静默安装远端软件包。

## 工作区行为

当前工作区就是执行边界。远端会话中的绝对路径、可执行文件、shell 状态和搜索工具都在对应 SSH 主机上解析；即使本机存在同名文件或命令，也不会混用。

远端文件系统结果只显示 POSIX 路径。本机 Workspace 身份目录不会作为文件路径展示给模型，也不会经由联动插件输出。

工具结果超过内联上限时，远端会话的完整结果通过 AHP 写入该 SSH 主机的私有 runtime 目录，提示中的 locator 也是远端 POSIX 路径。本机 spill 后端仅供本机会话使用；未知或失效的会话不会回退到本机保存。`glob`/`grep` 的结果也会在官方工具执行后校正到远端 POSIX 路径，避免 Windows 宿主把 `/root/...` 显示成 `E:\root\...`。

移除远端映射不会删除它的本地身份目录、Workspace 记录、Session 或消息历史。旧会话仍然可读，但新的工具调用会 fail-closed，而不是意外落到本机执行。

本机和远端目录都使用相同的应用内浏览器，不依赖原生目录选择器，也避开了 [DeepSeek Harness discussion #396](https://github.com/deepseek-ai/deepseek-harness/discussions/396) 中的 Windows 路径问题。

## Agent Host 更新

插件不会自行维护或重新分发 VS Code Server 压缩包。官方 standalone VS Code CLI 负责下载、缓存、启动和更新 Agent Host；CLI 自身支持：

```sh
code update --check
code update
```

AHP 协议协商与二进制更新相互独立。如果新缓存的 Agent Host 超出了插件验证过的协议范围，Remote SSH 会尝试其他兼容缓存；如果没有兼容版本，则明确显示客户端提供和服务端接受的协议版本。

## 安全

远端命令拥有 SSH 账号本身的权限。AHP permission 不是操作系统 sandbox；当 dsh 策略允许 Full Access 时，同一 SSH 账号通常也能访问所选工作区之外的路径。

为了让本机和远端工具保持一致语义，bundle 当前选择 `danger-full-access` 和 `never` approval policy。需要更强隔离时，请使用专用 Unix 账号、容器或虚拟机。

Web UI 不桥接密码、MFA 和首次 host-key 确认。请先通过 OpenSSH 完成这些步骤。

## 兼容性

- DeepSeek Harness `0.1.0-rc.8` package surface；
- POSIX/Linux SSH 主机；
- `@microsoft/agent-host-protocol` 0.7 客户端，并已针对 AHP 0.8 验证 Resource 与 Terminal 子集；
- 系统 OpenSSH 配置、SSH Agent、`known_hosts` 和 `ProxyJump`。
- 使用原生远端文件打开方式时，本机需要装有 Visual Studio Code、Cursor、Windsurf 或 VSCodium，以及兼容的 Remote SSH 扩展。

路由、协议、权限与生命周期细节见[设计文档](docs/design.md)。

## 开发

```sh
pnpm install
pnpm run check
node scripts/integration-ssh.mjs my-host /tmp/dsh-remote-ssh-integration/workspace
node scripts/integration-transparent.mjs my-host /tmp/dsh-remote-ssh-integration/workspace
```

真实集成脚本只修改显式传入的远端测试工作区和插件自己的运行时路径。

## 许可证

Apache-2.0。插件只调用用户的官方 VS Code CLI/Server，不重新分发 VS Code Server；官方 Server 的使用仍受 Microsoft VS Code Server License Terms 约束。
