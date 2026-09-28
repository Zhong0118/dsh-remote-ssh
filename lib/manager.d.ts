import { i as WorkspacePathMapper, r as RemoteSshRuntime } from "./runtime-BlvhzgVk.js";
import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { FileSystem } from "@deepseek-ai/dsh-fs";
import { ShellExecutor } from "@deepseek-ai/dsh-shell";
//#region src/routing/manager.d.ts
/** One SSH destination visible in Settings and workspace selection. */
interface RemoteSshServer {
  id: string;
  label: string;
  sshTarget: string;
  sshArgs?: string[];
  remoteCodeCommand?: string;
  sshExecutable?: string;
}
/** Durable projection from one local alias directory to one remote directory. */
interface RemoteSshWorkspace {
  id: string;
  serverId: string;
  remotePath: string;
  aliasPath?: string;
  title?: string;
}
/** Host-side policy for file links produced inside a remote Session. */
type RemoteOpenFileMode = 'auto' | 'vscode' | 'cursor' | 'windsurf' | 'vscodium' | 'custom' | 'download';
/** Multi-host transparent routing configuration. */
interface Config {
  aliasRoot?: string;
  /** Absolute OpenSSH config path. Empty uses the platform user and system defaults. */
  sshConfigFile?: string;
  servers?: RemoteSshServer[];
  workspaces?: RemoteSshWorkspace[];
  /** Prefer a VS Code-compatible Remote SSH editor; download is the fallback. */
  openFileMode?: RemoteOpenFileMode;
  /** Absolute executable path used when openFileMode is custom. */
  openFileEditorPath?: string;
  /** Maximum size of one downloaded fallback snapshot. */
  openFileDownloadMaxBytes?: number;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
}
interface ResolvedConfig {
  aliasRoot: string;
  sshConfigFile?: string;
  servers: RemoteSshServer[];
  workspaces: RemoteSshWorkspace[];
  openFileMode: RemoteOpenFileMode;
  openFileEditorPath?: string;
  openFileDownloadMaxBytes: number;
  startupTimeoutMs: number;
  requestTimeoutMs: number;
}
interface RemoteWorkspaceRoute {
  kind: 'remote';
  server: RemoteSshServer;
  workspace: RemoteSshWorkspace;
  aliasPath: string;
  mapper: WorkspacePathMapper;
}
interface LocalWorkspaceRoute {
  kind: 'local';
}
type ExecutionRoute = LocalWorkspaceRoute | RemoteWorkspaceRoute;
interface RemoteWorkspaceContext {
  ctx: Context;
  fs: FileSystem;
  remote: RemoteSshRuntime;
}
interface RemoteSshTransport {
  executable: string;
  args: string[];
  multiplexed: boolean;
}
interface RemoteDirectoryEntry {
  name: string;
  path: string;
}
interface RemoteDirectoryListing {
  path: string;
  home: string;
  parent?: string;
  entries: RemoteDirectoryEntry[];
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteSshManager: RemoteSshManager;
  }
}
/**
 * Owns the durable host/workspace catalog and lazy remote workspace contexts.
 * An alias that was once remote remains a remote tombstone after removal, so
 * stale sessions fail closed instead of silently running on the local host.
 */
declare class RemoteSshManager extends Service {
  static inject: string[];
  static Config: z<any>;
  private readonly entry;
  private readonly liveConfig;
  private current;
  private settings;
  private settingsRevision;
  private readonly routes;
  private readonly routeByWorkspaceId;
  private readonly remoteAliases;
  private readonly contexts;
  private readonly shellContexts;
  private readonly hosts;
  private readonly sessionWorlds;
  private workspaceRegistry;
  private refreshTail;
  private readonly initialRefresh;
  constructor(ctx: Context, config: Config);
  /** Wait until the composition-layer catalog has published its aliases. */
  protected [Service.init](): Promise<void>;
  /** Current detached catalog snapshot. */
  snapshot(): ResolvedConfig;
  /** Select one custom OpenSSH config, or restore the platform defaults. */
  setSshConfigFile(path?: string): Promise<void>;
  /** Update the native remote editor preference and its download fallback limit. */
  setOpenFileSettings(input: {
    mode: RemoteOpenFileMode;
    editorPath?: string;
  }): Promise<void>;
  /** Atomically update user-facing plugin preferences. Empty paths clear overrides. */
  updateUserPreferences(input: {
    sshConfigFile?: string;
    openFileMode?: RemoteOpenFileMode;
    openFileEditorPath?: string;
  }): Promise<void>;
  /** Browse directories through the server's shared AHP filesystem connection. */
  listRemoteDirectory(server: RemoteSshServer, requestedPath?: string): Promise<RemoteDirectoryListing>;
  /** Create a server entry through the settings provider. */
  addServer(input: Omit<RemoteSshServer, 'id'> & {
    id?: string;
  }): Promise<RemoteSshServer>;
  /** Create and register one remote workspace alias. */
  addWorkspace(serverId: string, remotePath: string): Promise<RemoteWorkspaceRoute>;
  /** Rename one remote workspace without changing its execution route. */
  renameWorkspace(id: string, title: string): Promise<RemoteWorkspaceRoute>;
  /** Remove execution routing while retaining alias, Workspace, and Session history. */
  removeWorkspace(id: string): Promise<boolean>;
  /** Remove one server and tombstone all of its workspace execution routes. */
  removeServer(id: string): Promise<boolean>;
  /** Pre-register a local directory with the stable LOCAL display prefix. */
  adoptLocalWorkspace(path: string): Promise<string>;
  /** Resolve a tool path/cwd into the only execution world allowed to handle it. */
  route(path?: string, cwd?: string): ExecutionRoute;
  /** Pin shell dispatch to the session workspace, regardless of an explicit tool workdir. */
  bindSession(sessionId: string, owner: object, cwd?: string): ExecutionRoute | undefined;
  /** Release only the binding owned by this exact live Agent. */
  unbindSession(sessionId: string, owner: object): void;
  /** Resolve the execution world bound to a live session without consulting path text. */
  sessionRoute(sessionId: string): ExecutionRoute | undefined;
  /** Resolve shell calls using their durable session world before considering workdir text. */
  routeShell(workdir: string, sessionId?: string): ExecutionRoute;
  /** Model-facing shell dialect for a workspace cwd. Remote workspaces are POSIX today. */
  dialectFor(cwd?: string): 'bash' | 'pwsh';
  /** Presentation-only logical cwd that never exposes the local UUID alias. */
  displayRemoteCwd(route: RemoteWorkspaceRoute, workdir?: string): string;
  /** Lookup a published route by its durable workspace id. */
  workspace(id: string): RemoteWorkspaceRoute;
  /** Lazily boot the AHP filesystem context for one remote workspace. */
  workspaceContext(route: RemoteWorkspaceRoute): Promise<RemoteWorkspaceContext>;
  /** Resolve the SSH executable/options shared by all channels for this host. */
  sshTransport(route: RemoteWorkspaceRoute): RemoteSshTransport;
  /** AHP-backed shell view sharing the host runtime but retaining workspace path mapping. */
  workspaceShell(route: RemoteWorkspaceRoute, dialect: 'bash' | 'pwsh'): Promise<ShellExecutor>;
  private queueRefresh;
  private publish;
  private registerAllWorkspaces;
  private findAlias;
  private findRemotePath;
  private wasRemoteAlias;
  private createWorkspaceContext;
  private hostContext;
  private createWorkspaceShellContext;
  private createHostContext;
  private transportFor;
  private disposeHost;
  private replaceSettings;
  private validate;
}
//#endregion
export { Config, ExecutionRoute, LocalWorkspaceRoute, RemoteDirectoryEntry, RemoteDirectoryListing, RemoteOpenFileMode, RemoteSshManager, RemoteSshManager as default, RemoteSshServer, RemoteSshTransport, RemoteSshWorkspace, RemoteWorkspaceContext, RemoteWorkspaceRoute };