import { RemoteSshManager, RemoteWorkspaceRoute } from "./manager.js";
import { Context } from "@deepseek-ai/cordis";
import { ToolCallView, ToolDefinition } from "@deepseek-ai/dsh-tools";
//#region src/routing/agent-policy.d.ts
declare const name = "dsh-remote-ssh-agent-policy";
declare const inject: string[];
/** Bind each live Agent to one execution world and expose only its native shell dialect. */
declare function apply(ctx: Context): void;
/** Replace the host-only Workspace alias with the remote execution cwd. */
declare function installRemoteWorkspacePrompt(ctx: Context, route: RemoteWorkspaceRoute): void;
/** Shadow only presentation; execution remains the official transparent shell tool. */
declare function remoteShellPresentation(base: ToolDefinition, manager: RemoteSshManager, route: RemoteWorkspaceRoute): ToolDefinition;
declare function presentRemoteShellCall(view: ToolCallView | undefined, args: unknown, manager: Pick<RemoteSshManager, 'displayRemoteCwd'>, route: RemoteWorkspaceRoute): ToolCallView | undefined;
//#endregion
export { apply, apply as default, inject, installRemoteWorkspacePrompt, name, presentRemoteShellCall, remoteShellPresentation };