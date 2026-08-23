import { a as DshHostProtocolDescription } from "./tunnel-CbyzHBpC.js";
import { AbstractApiClient, IApiClient } from "@deepseek-ai/dsh-host-apiproxy/client";
import { ApiProxy, HostFrame, MuxFrame, RpcRequest } from "@deepseek-ai/dsh-host-apiproxy/api";
//#region src/backend/client.d.ts
interface DshHostEndpoint {
  readonly origin: string;
  requestHeaders(): Readonly<Record<string, string>>;
  webSocketUrl(path: string): string;
  /** Present on reconnecting endpoints; resolves after a physical tunnel exists. */
  ready?(signal?: AbortSignal): Promise<unknown>;
}
interface HostExtensionResult<T = unknown> {
  type: 'server-response';
  rpcId: string;
  result: {
    ok: true;
    value?: T;
  } | {
    ok: false;
    error: {
      code: string;
      message: string;
      details: unknown;
    };
  };
}
interface DownloadedSessionLog {
  readonly fileName: string;
  readonly data: Uint8Array;
}
/**
 * The same client works in a terminal, daemon, test runner, or another UI.
 * Core domains use Harness' typed ApiClient; extension RPC uses invoke().
 */
declare class RemoteDshHostClient extends AbstractApiClient {
  private readonly endpoint;
  readonly api: IApiClient;
  constructor(endpoint: DshHostEndpoint, timeoutMs?: number);
  protected resolveBase(): string;
  protected doFetch(input: URL, init?: RequestInit): Promise<Response>;
  protected openMux(_payload: Parameters<ApiProxy['events']['mux']>[0]['payload'], signal: AbortSignal, onOpen?: () => void): AsyncIterable<RpcRequest<MuxFrame>>;
  protected openHost(_payload: Parameters<ApiProxy['events']['host']>[0]['payload'], signal: AbortSignal, onOpen?: () => void): AsyncIterable<RpcRequest<HostFrame>>;
  invoke<T = unknown>(namespace: string, method: string, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<HostExtensionResult<T>>;
  /** Discover the execution authority and optional Host capabilities. */
  describeProtocol(signal?: AbortSignal): Promise<DshHostProtocolDescription>;
  /** Download the Host's canonical Session ZIP through the authenticated carrier. */
  downloadSessionLog(sessionId: string, includeDescendants?: boolean, signal?: AbortSignal): Promise<DownloadedSessionLog>;
  /** Invoke an extension and turn its failure envelope into a thrown error. */
  invokeValue<T = unknown>(namespace: string, method: string, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<T>;
  private readWebSocket;
  private readWebSocketOnce;
}
declare class RemoteDshHostRpcError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details: unknown);
}
//#endregion
export { RemoteDshHostRpcError as a, RemoteDshHostClient as i, DshHostEndpoint as n, HostExtensionResult as r, DownloadedSessionLog as t };