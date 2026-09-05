import { a as DshHostProtocolDescription } from "./tunnel-CbyzHBpC.js";
//#region src/backend/client.d.ts
interface DshHostEndpoint {
  readonly origin: string;
  requestHeaders(): Readonly<Record<string, string>>;
  webSocketUrl(path: string): string;
  /** Present on reconnecting endpoints; resolves after a physical tunnel exists. */
  ready?(signal?: AbortSignal): Promise<unknown>;
}
interface HostStreamEnvelope<T = unknown> {
  rpcId: string;
  payload: T;
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
 * Core domains use HTTP invoke(); Host event streams use WebSocket.
 */
declare class RemoteDshHostClient {
  private readonly endpoint;
  private readonly timeoutMs?;
  readonly events: {
    host: (_payload: unknown, signal: AbortSignal, onOpen?: () => void) => AsyncGenerator<HostStreamEnvelope<unknown>, any, any>;
    mux: (_payload: unknown, signal: AbortSignal, onOpen?: () => void) => AsyncGenerator<HostStreamEnvelope<unknown>, any, any>;
  };
  constructor(endpoint: DshHostEndpoint, timeoutMs?: number | undefined);
  private resolveBase;
  private doFetch;
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
export { RemoteDshHostClient as a, HostStreamEnvelope as i, DshHostEndpoint as n, RemoteDshHostRpcError as o, HostExtensionResult as r, DownloadedSessionLog as t };