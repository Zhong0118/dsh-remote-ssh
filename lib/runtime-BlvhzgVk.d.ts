import { AhpClient } from "@microsoft/agent-host-protocol/client";
import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
//#region src/transport/runtime.d.ts
interface Config {
  sshTarget: string;
  remoteWorkspace?: string;
  localWorkspace?: string;
  remoteAccessRoot?: string;
  sshExecutable?: string;
  sshArgs?: string[];
  remoteCodeCommand?: string;
  remoteRuntimeRoot?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  protocolVersions?: string[];
  directUrl?: string;
}
interface ResolvedConfig extends Config {
  sshExecutable: string;
  sshArgs: string[];
  remoteCodeCommand: string;
  remoteRuntimeRoot: string;
  startupTimeoutMs: number;
  requestTimeoutMs: number;
  protocolVersions: string[];
}
interface AhpConnection {
  client: AhpClient;
  protocolVersion: string;
  defaultDirectory?: string;
}
declare function quotePosix(value: string): string;
/** Build the POSIX bootstrap that resolves the VS Code CLI and starts Agent Host. */
declare function buildRemoteAgentHostCommand(remoteCodeCommand: string): string;
/** List installed VS Code Server entrypoints newest-first for compatibility probing. */
declare function buildListEmbeddedAgentHostsCommand(): string;
/** Build the fallback bootstrap for a VS Code Server installation left by Remote - SSH. */
declare function buildEmbeddedAgentHostCommand(codeServerPath?: string, instanceId?: string): string;
declare function fileUriFromPosixPath(path: string): string;
declare function posixPathFromFileUri(uri: string): string;
declare class WorkspacePathMapper {
  readonly localWorkspace: string;
  readonly remoteWorkspace: string;
  constructor(localWorkspace: string, remoteWorkspace: string);
  toRemotePath(input: string, cwd?: string): string;
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteSsh: RemoteSshRuntime;
  }
}
declare class RemoteSshRuntime extends Service {
  static Config: z<Config>;
  readonly mapper: WorkspacePathMapper | undefined;
  readonly config: ResolvedConfig;
  readonly clientId: string;
  readonly runtimeRoot: string;
  readonly remoteAccessRoot: string;
  private readonly ready;
  private tunnel;
  private embeddedAgentHost;
  private disposed;
  constructor(ctx: Context, config: Config);
  getConnection(): Promise<AhpConnection>;
  getClient(): Promise<AhpClient>;
  /** Workspace mapper for the legacy single-workspace providers. */
  getMapper(): WorkspacePathMapper;
  private validate;
  private open;
  private connectEndpoint;
  private openOverSsh;
  private listEmbeddedAgentHosts;
  private startEmbeddedAgentHost;
  private openTunnel;
  private resetSshAttempt;
}
//#endregion
export { buildEmbeddedAgentHostCommand as a, fileUriFromPosixPath as c, WorkspacePathMapper as i, posixPathFromFileUri as l, Config as n, buildListEmbeddedAgentHostsCommand as o, RemoteSshRuntime as r, buildRemoteAgentHostCommand as s, AhpConnection as t, quotePosix as u };