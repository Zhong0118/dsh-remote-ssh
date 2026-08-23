//#region src/backend/install.d.ts
/** Build the remote installer/launcher that never uses VS Code Server or AHP. */
declare function buildDshBackendCommand(remotePort: number): string;
//#endregion
//#region src/backend/tunnel.d.ts
/** Zero lets the remote Host select a collision-free loopback port. */
declare const DEFAULT_DSH_HOST_PORT = 0;
declare const DSH_HOST_PROTOCOL_VERSION = 1;
type DshHostProgressStage = 'connecting' | 'reconnecting' | 'waiting-host' | 'checking-host' | 'uploading-host' | 'reusing-host' | 'installing-host' | 'checking-runtime' | 'installing-node' | 'installing-pnpm' | 'installing-harness' | 'verifying-runtime' | 'installing-bundle' | 'installed' | 'starting-host' | 'ready' | 'failed';
interface DshHostProgress {
  stage: DshHostProgressStage;
}
interface DshHostProtocolDescription {
  protocol: 'dsh-host';
  protocolVersion: number;
  transport: 'http+websocket';
  rpcPath: string;
  muxEventsPath: string;
  hostEventsPath: string;
  capabilities: readonly string[];
}
interface RemoteDshHostTunnelConfig {
  sshExecutable: string;
  sshArgs: string[];
  sshTarget: string;
  remotePort: number;
  startupTimeoutMs: number;
  /** Built dsh-host package root; normally discovered from the installed dependency. */
  packageRoot?: string;
  /** Receives structured stages without opening another SSH connection. */
  onProgress?: (progress: DshHostProgress) => void;
  /** Cancels an in-flight SSH bootstrap without affecting the detached Host. */
  signal?: AbortSignal;
}
/**
 * A transport shared by Web, TUI, and other clients. It installs or reuses the
 * Host, keeps one SSH connection alive, and exposes its HTTP/WebSocket endpoint.
 */
declare class RemoteDshHostTunnel {
  private readonly ssh;
  private readonly forward;
  private readonly forwardSockets;
  private readonly token;
  readonly localPort: number;
  readonly remotePort: number;
  readonly origin: string;
  /** Resolves whenever the underlying SSH process exits. */
  readonly closed: Promise<void>;
  private disposed;
  private constructor();
  get alive(): boolean;
  /** Headers for direct Host HTTP requests and WebSocket handshakes. */
  requestHeaders(): Readonly<Record<string, string>>;
  /** Authenticated WebSocket URL for clients that cannot set handshake headers. */
  webSocketUrl(path: string): string;
  /** Make an authenticated request over the forwarded Host protocol. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** Read and validate the Host's UI-neutral carrier contract. */
  describeProtocol(signal?: AbortSignal): Promise<DshHostProtocolDescription>;
  static open(config: RemoteDshHostTunnelConfig): Promise<RemoteDshHostTunnel>;
  dispose(): Promise<void>;
}
declare function parseProtocolDescription(value: unknown): DshHostProtocolDescription;
//#endregion
export { DshHostProtocolDescription as a, parseProtocolDescription as c, DshHostProgressStage as i, buildDshBackendCommand as l, DSH_HOST_PROTOCOL_VERSION as n, RemoteDshHostTunnel as o, DshHostProgress as r, RemoteDshHostTunnelConfig as s, DEFAULT_DSH_HOST_PORT as t };