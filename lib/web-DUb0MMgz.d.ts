import { i as RemoteDshHostConnectionConfig, r as RemoteDshHostConnection } from "./connection-CoC0PijV.js";
//#region src/backend/web.d.ts
declare const DEFAULT_DSH_BACKEND_PORT = 0;
interface RemoteWebProxyConfig extends RemoteDshHostConnectionConfig {
  localUiPort: number;
}
interface RemoteWebProxyAttachment {
  /** Bootstrap URL; the gateway exchanges its query token for an HttpOnly cookie. */
  url: string;
  localPort: number;
  remotePort: number;
  dispose(): Promise<void>;
}
/** Serve local Web assets and proxy the unchanged Host protocol on one origin. */
declare class RemoteDshWebProxy implements RemoteWebProxyAttachment {
  private readonly connection;
  private readonly gateway;
  private readonly initialRemotePort;
  private readonly sockets;
  private readonly ownsTunnel;
  readonly localPort: number;
  readonly url: string;
  private disposed;
  private constructor();
  get alive(): boolean;
  get remotePort(): number;
  static open(config: RemoteWebProxyConfig): Promise<RemoteDshWebProxy>;
  /** Add the browser same-origin proxy without taking ownership of the SSH tunnel. */
  static attach(connection: RemoteDshHostConnection, localUiPort: number): Promise<RemoteDshWebProxy>;
  private static attachInternal;
  dispose(): Promise<void>;
}
/** @deprecated Use RemoteWebProxyConfig. */
type RemoteBackendConfig = RemoteWebProxyConfig;
/** @deprecated Use RemoteWebProxyAttachment. */
type RemoteBackendAttachment = RemoteWebProxyAttachment;
//#endregion
export { RemoteWebProxyAttachment as a, RemoteDshWebProxy as i, RemoteBackendAttachment as n, RemoteWebProxyConfig as o, RemoteBackendConfig as r, DEFAULT_DSH_BACKEND_PORT as t };