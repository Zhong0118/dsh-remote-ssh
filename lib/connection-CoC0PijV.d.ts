import { a as DshHostProtocolDescription, s as RemoteDshHostTunnelConfig } from "./tunnel-CbyzHBpC.js";
import { n as DshHostEndpoint } from "./client-BRvjWg_X.js";
//#region src/backend/connection.d.ts
interface DshHostTransport extends DshHostEndpoint {
  readonly alive: boolean;
  readonly localPort: number;
  readonly remotePort: number;
  readonly closed: Promise<void>;
  fetch(path: string, init?: RequestInit): Promise<Response>;
  describeProtocol(signal?: AbortSignal): Promise<DshHostProtocolDescription>;
  dispose(): Promise<void>;
}
type DshHostTunnelOpener = (config: RemoteDshHostTunnelConfig) => Promise<DshHostTransport>;
interface RemoteDshHostConnectionConfig extends RemoteDshHostTunnelConfig {
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
}
/**
 * Stable logical connection whose physical SSH process may be replaced. The
 * remote Host remains a singleton; only the observation tunnel reconnects.
 */
declare class RemoteDshHostConnection implements DshHostEndpoint {
  private readonly config;
  private readonly opener;
  private current;
  private reconnecting;
  private disposed;
  private readonly stopped;
  private readonly initialDelayMs;
  private readonly maxDelayMs;
  private constructor();
  static open(config: RemoteDshHostConnectionConfig, opener?: DshHostTunnelOpener): Promise<RemoteDshHostConnection>;
  get alive(): boolean;
  get connected(): boolean;
  get origin(): string;
  get localPort(): number;
  get remotePort(): number;
  requestHeaders(): Readonly<Record<string, string>>;
  webSocketUrl(path: string): string;
  /** Wait for the current tunnel, sharing one retry loop across all callers. */
  ready(signal?: AbortSignal): Promise<DshHostTransport>;
  fetch(path: string, init?: RequestInit): Promise<Response>;
  describeProtocol(signal?: AbortSignal): Promise<DshHostProtocolDescription>;
  /** Force a fresh physical tunnel while preserving the remote Host process. */
  reconnect(): Promise<void>;
  dispose(): Promise<void>;
  private install;
  private startReconnect;
  private reconnectLoop;
  private requireCurrent;
  private attemptConfig;
}
//#endregion
export { RemoteDshHostConnectionConfig as i, DshHostTunnelOpener as n, RemoteDshHostConnection as r, DshHostTransport as t };