# Installation Runbook for CLI Agents

This is the complete installation procedure for Codex, Claude Code, and other automation agents. Do not inspect plugin source or another plugin to infer missing steps.

## Objective

Install `dsh-remote-ssh` into the requested DeepSeek Harness profile, preserve unrelated profile and SSH configuration, verify the transparent routing bundle, and prepare only the SSH hosts explicitly selected by the user.

## Defaults

- **Package:** install `dsh-remote-ssh` from the configured npm registry. Use a local checkout only when the user explicitly supplies one for development.
- **Profile:** use the user-named profile; otherwise use `web`.
- **Launcher:** prefer an installed `dsh`. From a DeepSeek Harness source checkout, run commands in that checkout and replace `dsh` with `pnpm dsh`.
- **SSH configuration:** use the platform's default user and system OpenSSH files unless the user supplies a custom absolute path.

The bundle uses standard dsh plugin APIs. Do not patch, fork, build, or commit changes to the DeepSeek Harness repository during installation.

## Safety requirements

- Never read, print, copy, upload, or modify private SSH keys.
- Never request a password, MFA response, private-key passphrase, or SSH Agent material.
- Do not overwrite `~/.ssh/config`, the system SSH config, `known_hosts`, or an existing Host block. Adding a Host through the UI requires an explicit user action.
- Do not install VS Code CLI, `bash`, `rg`, or any other remote package without explicit user authorization.
- Do not accept a new host key on the user's behalf. Ask the user to verify it with ordinary OpenSSH.
- Preserve every unrelated profile dependency and `cordis.patch.yml` row.
- Never delete remote files, workspace aliases, Workspace records, or Session history during install, update, or removal.
- Warn that this bundle selects `danger-full-access` and approval policy `never`; the SSH account, container, or VM is the remote security boundary.

## Procedure

### 1. Validate the launcher

Run:

```sh
dsh --help
```

From a DeepSeek Harness source checkout:

```sh
pnpm dsh --help
```

Stop and report the exact launcher failure if it does not run.

### 2. Install the bundle

For the default Web profile:

```sh
dsh plugin --profile web add dsh-remote-ssh
```

From a Harness source checkout:

```sh
pnpm dsh plugin --profile web add dsh-remote-ssh
```

If the user explicitly supplied a local checkout, require all of these files before installation:

- `package.json`, with `name` equal to `dsh-remote-ssh`;
- `cordis.patch.yml`;
- `lib/host.js`;
- `lib/client.js`.

If the built files are missing, run `pnpm install` and `pnpm run check` in the plugin checkout. Then install its normalized absolute path, using forward slashes on Windows:

```sh
dsh plugin --profile web add link:E:/absolute/path/to/dsh-remote-ssh
```

The add command is idempotent. It must leave `dsh-remote-ssh` in the profile dependency map and bundle list exactly once.

### 3. Validate the effective composition

Run:

```sh
dsh --profile web --dump-config
```

Require these facts:

- `remote-ssh-manager`, `remote-ssh-web`, `remote-ssh-fs-router`, `remote-ssh-subprocess-router`, and `remote-ssh-agent-policy` load from `dsh-remote-ssh`;
- the stock root `subprocess`, `fs-sandbox`, `bash-sandbox`, `pwsh-sandbox`, `tool-bash`, `tool-pwsh`, `spill-local`, and native `directory-picker` rows are disabled by the bundle;
- host-level `tool-fs-search` is disabled so agent-preset search loads after the remote path hook;
- `sandbox-policy.config.mode` is `danger-full-access` and `approval.config.policy` is `never`.

Stop and report the exact diagnostic if composition fails. Do not edit unrelated rows to make the bundle load.

### 4. Verify OpenSSH outside dsh

List the concrete Host aliases in the active OpenSSH configuration without printing key files or environment secrets. For the host selected by the user, run:

```sh
ssh -o BatchMode=yes -o ConnectTimeout=8 <host-alias> true
```

If it fails because of a password, MFA, host-key prompt, or missing key, stop and ask the user to complete ordinary `ssh <host-alias>` setup interactively. Do not weaken host-key checking or authentication settings.

### 5. Verify remote prerequisites

After non-interactive SSH succeeds, perform a read-only check:

```sh
ssh -T <host-alias> 'printf "host=%s\n" "$(hostname)"; for cmd in bash base64 mkfifo rg code; do if command -v "$cmd" >/dev/null 2>&1; then printf "%s=1\n" "$cmd"; else printf "%s=0\n" "$cmd"; fi; done; find "$HOME/.vscode-server/cli/servers" -type f -path "*/server/bin/code-server" -perm -u+x -print -quit 2>/dev/null || true'
```

Require `bash`, `base64`, and `mkfifo`. `rg` is required for glob and grep. Agent Host requires either:

- `code agent host` from an official VS Code CLI;
- `~/.dsh-remote-ssh/cli/bin/code`; or
- an existing compatible `server/bin/code-server` under the VS Code Server cache.

Report missing commands; do not install them automatically.

### 6. Optional private VS Code CLI installation

Skip this step when a compatible Agent Host is already available. Run it only after the user explicitly authorizes installing the official standalone VS Code CLI on the selected POSIX/Linux host.

Resolve `uname -m` first. Use `cli-alpine-x64` for `x86_64` and `cli-alpine-arm64` for `aarch64`/`arm64`. Stop on any other architecture.

Download into a fresh temporary directory, verify the extracted `code` executable, and atomically install it as:

```text
~/.dsh-remote-ssh/cli/bin/code
```

Use the official download endpoint only:

```text
https://code.visualstudio.com/sha/download?build=stable&os=<platform>
```

Do not add the private CLI to the user's shell profile or system PATH. Verify it without starting a tunnel:

```sh
~/.dsh-remote-ssh/cli/bin/code --version
~/.dsh-remote-ssh/cli/bin/code agent host --help
```

The official CLI manages Agent Host downloads and cache. Do not download or unpack VS Code Server yourself.

### 7. Configure Remote SSH in the Web UI

Start the Web profile only when the user wants it running:

```sh
dsh web
```

Then:

1. open **Settings → Remote SSH**;
2. confirm that the expected Host alias appears;
3. use **Test** and require a successful SSH result;
4. use **Browse remote…** to select the user-requested absolute POSIX workspace path;
5. add the workspace and require it to appear as `<Server> > <folder>`.

For a custom config, set its absolute path under **Settings → Plugins → Remote SSH**. Do not copy its contents into dsh settings.

Under the same plugin settings, leave **Open remote files with** on auto-detect, choose a specific supported editor, or select the download-only fallback. Native opening requires that editor's compatible Remote SSH extension.

### 8. Verify transparent execution

Create or open a disposable session in the new remote workspace. Verify with ordinary model-facing tools, not special remote tools:

- a file read returns a file known to exist on the remote host;
- `bash` runs `pwd` and `hostname` on the selected host;
- a second `bash` call preserves a `cd` or exported test variable from the first call;
- glob or grep uses remote `rg`;
- the tool card shows `<Server> > <workspace>`, not an internal UUID;
- no `pwsh` tool is exposed for a POSIX/Linux remote workspace;
- a local session still uses local files and `pwsh` on Windows.
- a remote file link opens at the same POSIX path in the configured Remote SSH editor, or as a local snapshot when download-only mode is selected.

Do not create or modify files outside the user-approved test workspace.

### Optional full Backend mode

This is separate from the AHP workspace flow. Use it only when the user wants
the AI runtime and all Harness state to live on the SSH host.

1. Build or install the matching `dsh-host` bundle beside this connector.
2. In **Settings → Remote SSH**, select **Open Backend in Web** beside the host.
   The connector must upload and install or upgrade the Host through that same
   SSH process; do not preinstall it manually for this verification.
3. Require the Web client to load remote sessions and keep receiving
   WebSocket events.
4. Close the Web client and reconnect. Require the same Backend identity and
   existing sessions to remain.

The connector uses one SSH process for package negotiation, Host startup/reuse,
and all HTTP/WebSocket forwarding. Do not replace it with separate probe,
upload, token-read, and tunnel SSH commands; rate-limited servers depend on the
single-connection contract.

### 9. Report completion

Report only:

- installed profile;
- installed `dsh-remote-ssh` version or local checkout path;
- SSH Host alias tested;
- whether Agent Host was already present or the private CLI was explicitly installed;
- selected remote workspace path;
- whether transparent file, shell, search, and tool-dialect checks passed.

Do not report secrets, private config contents, connection tokens, internal workspace alias paths, or host fingerprints unless the user specifically requests the fingerprint for verification.

## Updating

Update the plugin:

```sh
dsh plugin --profile web update dsh-remote-ssh
```

Restart dsh and repeat composition and transparent-execution validation. A local `link:` installation follows its checkout; rebuild it with `pnpm run check` and repeat the local add command.

For an explicitly managed private VS Code CLI:

```sh
ssh -T <host-alias> '~/.dsh-remote-ssh/cli/bin/code update --check'
ssh -T <host-alias> '~/.dsh-remote-ssh/cli/bin/code update'
```

Run the update only with user authorization. Agent Host is managed by the CLI; do not overwrite cached Server directories. If a new Host protocol is incompatible, the plugin probes compatible cached versions and otherwise reports the version mismatch.

## Removal

Only when explicitly requested:

```sh
dsh plugin --profile web remove dsh-remote-ssh
```

Do not delete SSH config, keys, `known_hosts`, remote files, workspace aliases, Workspace records, Session logs, the private CLI, or VS Code Server caches as part of bundle removal. Each is a separate destructive action requiring explicit authorization.

## Failure handling

- **Package not found:** confirm the registry is `https://registry.npmjs.org/` and retry the exact package name `dsh-remote-ssh`.
- **Bundle composition failure:** run `dsh plugin --profile <profile> why dsh-remote-ssh`; do not remove unrelated plugins.
- **SSH authentication failure:** ask the user to make ordinary non-interactive OpenSSH access work first.
- **Host key failure:** stop; never use `StrictHostKeyChecking=no` as a workaround.
- **No Agent Host:** report the missing prerequisite and offer the explicit private-CLI installation step.
- **AHP version mismatch:** update the plugin first; retain cached Server versions and report the offered/accepted versions.
- **Missing `rg`:** file reads and Bash may work, but glob/grep must fail honestly until the user installs ripgrep.
- **Removed mapping:** preserve history; do not recreate or silently retarget an old session without the user's choice.
