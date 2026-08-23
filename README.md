# dsh Remote SSH

English | [中文](README.zh.md)

Use SSH hosts as transparent workspaces in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Remote SSH has two compatible modes. A remote workspace keeps the AI runtime
local and transparently routes its tools through AHP. A Host tunnel attaches
any protocol client to a complete persistent Harness running on the SSH host
through [dsh-host](https://github.com/Yan-Zero/dsh-host). **Open Backend in
Web** is the browser entry for that same tunnel.

Choose `LOCAL > project` and ordinary file, search, shell, and background-task tools run locally. Choose `<Server> > project` and those same tools run on that SSH host. There is no second set of `remote_*` tools, and a remote failure never falls back to the local machine.

## Features

- discovers concrete hosts from the user and system OpenSSH configuration, including recursive `Include` files;
- manages multiple SSH hosts and multiple workspaces per host from Settings;
- provides the same editable directory browser for local and remote folders;
- labels workspaces and terminal calls as `LOCAL > ...` or `<Server> > ...`;
- routes filesystem access, search, subprocesses, background jobs, and terminals by the active workspace;
- exposes binary workspace writes for artifact plugins such as `dsh-codex` image generation; raw bytes are base64-encoded only inside AHP `resourceWrite` transport;
- keeps remote search results in POSIX path space and stores oversized tool results in a private runtime directory on the corresponding SSH host for follow-up `read`/`grep` access;
- exposes `bash` for POSIX remote workspaces and `pwsh` for local Windows workspaces;
- opens remote file links in an installed VS Code-compatible editor through its Remote SSH extension, with a local downloaded snapshot as fallback;
- reuses one persistent SSH/AHP host connection while each Bash call opens its own terminal channel, like a new VS Code terminal tab;
- shares one host-scoped SSH/AHP connection across workspaces on the same server;
- opens a UI-neutral remote Backend over one persistent SSH connection carrying startup, authentication, HTTP, and WebSocket forwarding;
- exports the forwarded Host endpoint and a typed Node API client independently of the optional Web reverse proxy;
- preserves readable Workspace and Session history after a remote mapping is removed, while rejecting new tool calls from the old session.

Remote workspaces currently support POSIX/Linux hosts. Windows SSH hosts are not yet supported.

## Install

Install the published bundle into the Web profile:

```sh
dsh plugin --profile web add dsh-remote-ssh
dsh web
```

This fork targets the Web profile only. Manage SSH hosts and remote workspaces
from **Settings → Remote SSH**, then start a session in `<Server> > <folder>`.

From a DeepSeek Harness source checkout, use `pnpm dsh` in place of `dsh`. For local plugin development:

```sh
pnpm install
pnpm run check
pnpm dsh plugin --profile web add link:E:/absolute/path/to/dsh-remote-ssh
pnpm dsh --profile web
```

Codex, Claude Code, and other automation agents should follow [INSTALL.md](INSTALL.md). It is a complete, idempotent runbook.

## Set up a host

1. Configure and verify the host with ordinary OpenSSH first. Key or SSH Agent authentication is recommended.
2. Open **Settings → Remote SSH**. The page reads the platform's default user and system SSH configuration automatically.
3. Test the host, then select **Browse remote…** to choose a workspace folder.
4. Start or open a session in `<Server> > <folder>`.

To use a non-default SSH configuration, set its absolute path under **Settings → Plugins → Remote SSH → Custom SSH config file**.

Remote file links use the first supported VS Code-compatible editor by default. Choose a specific editor or the download-only fallback under **Settings → Plugins → Remote SSH → Open remote files with**.

The remote host needs:

- a POSIX shell and non-interactive OpenSSH access;
- `bash`, `base64`, and `mkfifo` for shell and subprocess execution;
- `rg` for glob and grep tools;
- a VS Code Agent Host supplied by the official VS Code CLI or an existing VS Code Server installation.

The full Backend mode does not use VS Code Server or AHP. The connector uploads its matching `dsh-host`
bundle through the same SSH connection and installs or upgrades a private,
versioned runtime under `~/.dsh-host`. One `dsh-remote-ssh` Host instance is
shared per remote OS user. Reconnecting discovers the registered PID and
random loopback port, then reaches it through the same OpenSSH dynamic SOCKS
channel; only a changed bundle replaces the instance. Concurrent updates are
serialized by a remote install lock. All clients use the same forwarded Host
protocol. Selecting **Open Backend in Web** adds a
local same-origin proxy for the browser assets; closing it or its SSH tunnel
does not stop the Backend.

The logical Backend connection survives physical SSH failures. It rebuilds
the dynamic tunnel with jittered exponential backoff, keeps the Web gateway
URL stable, and reopens Host event streams. A unary mutation interrupted at
the transport boundary is not replayed automatically, because its remote
completion cannot be determined safely; later calls wait for reconnection.

The first Backend installation additionally needs `curl`, `sha256sum`, `tar`
with xz support, and network access to the Node.js and npm registries. It does
not modify the system package manager.

The plugin checks `code` on PATH, its private `~/.dsh-remote-ssh/cli/bin/code` location, and compatible VS Code Server installations already cached on the host. It does not install remote packages silently.

## How workspaces behave

The active workspace is the execution boundary. A remote session resolves absolute paths, executables, shell state, and search tools on its SSH host—even when a local file or executable has the same name.

Remote filesystem results expose POSIX paths only. The local Workspace identity directory is never presented to the model or emitted by cooperating plugins as a file path.

When a tool result exceeds the inline budget, a remote session writes the complete result through AHP into that SSH host's private runtime directory and returns a remote POSIX locator. The local spill backend is used only for local sessions; an unknown or stale session never falls back to host storage. Stock `glob`/`grep` results are also normalized back into remote POSIX path space, preventing a Windows host from presenting `/root/...` as `E:\root\...`.

Removing a remote mapping does not delete its local identity directory, Workspace record, Session, or message history. Old sessions remain readable, but new tool calls fail closed instead of accidentally running locally.

Local and remote folder selection use the same in-app browser. This avoids native picker dependencies and also works around the Windows path issue described in [DeepSeek Harness discussion #396](https://github.com/deepseek-ai/deepseek-harness/discussions/396).

## Agent Host updates

The plugin does not maintain or redistribute VS Code Server archives. The official standalone VS Code CLI downloads, caches, starts, and updates Agent Host. The CLI itself supports:

```sh
code update --check
code update
```

AHP negotiation is independent from binary updates. If a newly cached Agent Host is newer than the protocol surface validated by this plugin, Remote SSH tries another compatible cached Host and otherwise reports the offered and accepted protocol versions clearly.

## Security

Remote commands have the permissions of the SSH account. AHP permissions are not an operating-system sandbox, and one SSH account can normally reach paths outside the selected workspace when the active dsh policy grants full access.

The bundle currently selects `danger-full-access` with approval policy `never` so local and remote tools have consistent semantics. Use a dedicated Unix account, container, or VM when stronger isolation is required.

Passwords, MFA prompts, and first-use host-key confirmation are not bridged into the Web UI. Complete those steps with OpenSSH before using the host in dsh.

## Compatibility

- DeepSeek Harness `0.1.0-rc.8` package surface;
- POSIX/Linux SSH hosts;
- `@microsoft/agent-host-protocol` 0.7 client with the Resource and Terminal subset validated against AHP 0.8;
- system OpenSSH configuration, SSH Agent, `known_hosts`, and `ProxyJump`.
- local Visual Studio Code, Cursor, Windsurf, or VSCodium with a compatible Remote SSH extension for native remote file opening.

See [the design document](docs/design.md) for routing, protocol, permissions, and lifecycle details.

## Development

```sh
pnpm install
pnpm run check
node scripts/integration-ssh.mjs my-host /tmp/dsh-remote-ssh-integration/workspace
node scripts/integration-transparent.mjs my-host /tmp/dsh-remote-ssh-integration/workspace
```

The live integration scripts modify only the explicitly supplied remote test workspace and plugin-owned runtime paths.

## License

Apache-2.0. The plugin calls the user's official VS Code CLI/Server installation and does not redistribute VS Code Server. Use of the official Server remains subject to the Microsoft VS Code Server License Terms.
