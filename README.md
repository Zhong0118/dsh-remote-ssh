# dsh Remote SSH

English | [中文](README.zh.md)

Use SSH hosts as transparent workspaces in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The AI runtime stays on your local machine. Choose `LOCAL > project` and ordinary file, search, shell, and background-task tools run locally. Choose `<Server> > project` and those same tools run on that SSH host through AHP. There is no second set of `remote_*` tools, and a remote failure never falls back to the local machine.

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
- preserves readable Workspace and Session history after a remote mapping is removed, while rejecting new tool calls from the old session.

Remote workspaces currently support POSIX/Linux hosts. Windows SSH hosts are not yet supported.

## Install

Install the published bundle into the Web profile:

```sh
dsh plugin --profile web add github:Zhong0118/dsh-remote-ssh#web-dsh-rc8
dsh web
```

This fork targets the Web profile only: local AI, remote files/shell over SSH.
Manage hosts from **Settings → Remote SSH**, then start a session in `<Server> > <folder>`.

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
- `bash`, `base64`, `dd`, and `mkfifo` for shell, byte-range filesystem reads, and subprocess execution;
- `rg` for glob and grep tools;
- a VS Code Agent Host supplied by the official VS Code CLI or an existing VS Code Server installation.

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

- DeepSeek Harness `0.1.7-rc.2` package surface;
- POSIX/Linux SSH hosts;
- `@microsoft/agent-host-protocol` 0.9 client (handshake also offers 0.8–0.5.1);
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
