# DSH 0.1.7-rc.2 Remote SSH Compatibility Design

## Goal and boundary

Update the existing Web-only `dsh-remote-ssh` bundle from the DSH `0.1.2-rc.1` package surface to the locally installed, registry-current `0.1.7-rc.2`. Preserve transparent LOCAL/SSH execution, fail-closed removed remote workspaces, persistent server/workspace/session records, and Windows-host/POSIX-remote support. Do not modify SSH keys, SSH host configuration, unrelated profile plugins, the DSH checkout, or the pre-existing untracked `.dsh-meow/` directory. No remote host was nominated: live SSH execution will be explicitly reported unverified.

## Evidence and compatibility changes

The installed Web composition no longer contains `agent-presets`; it has `agent-preset-registry` and `preset-standard` with agent-scoped shell and search tools. Host shell and search rows are disabled. The old bundle's patch for `agent-presets` is skipped, and the plugin's global `ctx.tools.get('bash'/'pwsh')` precondition cannot succeed. The current tools API restricts only known inherited global names, so restricting absent preset-scoped tools is invalid. On Windows, stock preset defaults to pwsh only, but a POSIX remote requires bash. The Plugins settings shell now declares `settings.plugins.tab` rather than `settings.plugin.item`. The existing Web profile does not currently contain an active remote-ssh installation.

## Composition and agent lifecycle

Retain the current SSH/AHP transport, manager, filesystem/subprocess/spill routers, local provider isolation, and `danger-full-access`/`never` security boundary. Make the bundle's preset integration target rows and APIs present in the new composition. Bind every created agent to its session workspace regardless of global tool availability; for a remote agent, install the remote cwd prompt and a POSIX bash tool in the actual agent composition before tool use. Keep the local host's native dialect (bash on POSIX, pwsh on Windows) and ensure the opposite dialect does not become model-visible. Reconcile agent creation, disposal, and preset changes without relying on a nonexistent global pair of shell tools. The shared routing boundary rejects stale/removed remote mappings rather than falling back to the host. Preserve native tool names and contracts: do not add `remote_*` tools.

The search path normalization mechanism must be active before each relevant preset-scoped search tool loads; replace the stale startup barrier with ordering against actual provider/preset lifecycle. If the stock parser signature changes, fail explicitly rather than silently returning host paths. Do not introduce speculative abstraction layers or change unrelated preset features.

## Client

Move the existing Remote SSH plugin settings card to the `settings.plugins.tab` list-slot API with the required ID, label, order, and component layout. Keep the separate `settings.section` Remote SSH management screen, directory flow, and remote file open behavior. Do not change persisted settings keys or API paths. Browser validation should confirm both settings surfaces actually render and remain usable.

## Packaging and installation

Synchronize DSH peer/dev dependency floors and workspace overrides with the tested `0.1.7-rc.2` package set without gratuitous third-party upgrades. Update the documented compatibility and install instructions to match the tested version and branch. Run typecheck, tests, build, package/composition checks and browser smoke checks; preserve local and remote behavior assertions. Bump the plugin version appropriately, commit and push `web-dsh-rc8`, then add the resulting GitHub branch to the `web` profile without replacing other dependencies or profile rows. Verify that the effective profile contains the plugin once, with the expected enabled/disabled routing rows and safety policy. If the Web app must be restarted for a newly installed plugin, do not start a replacement server; explicitly verify the running GUI after a supported refresh/restart or report that this was not possible.

## Validation and limits

Regression checks must catch absent preset rows, missing agent session binding, wrong tool visibility on POSIX and Windows, incorrect remote search path rewriting, and missing Plugins tab registration. Run the full test/build suite against updated dependencies and inspect composition on the actual installed DSH. Browser-check the existing Web GUI when practical. No remote SSH host is authorized for this run; report connection, remote file/shell/search execution, and VS Code Agent Host handshake as **not tested**, not passed. Stop on packaging, composition, install, or push failure and report the exact blocker; do not weaken SSH security or silently edit unrelated profile state.
