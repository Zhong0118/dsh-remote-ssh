import { i as RemoteDshHostClient } from "./client-BRvjWg_X.js";
//#region src/backend/control.d.ts
type HostControlOperation = 'shell' | 'doctor' | 'mcp' | 'init' | 'btw' | 'commands' | 'session.mode' | 'session.delete' | 'provider.setup';
type HostControlAvailability = {
  readonly supported: true;
} | {
  readonly supported: false;
  readonly reason: string;
};
interface HostControlDescription {
  readonly authority: 'remote-host';
  readonly localFallback: 'forbidden';
  readonly operations: Readonly<Record<HostControlOperation, HostControlAvailability>>;
}
interface HostShellResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}
interface HostDoctorResult {
  readonly node: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly cwd: string;
  readonly sessionId?: string;
  readonly sessionAttached: boolean;
  readonly apiKeyConfigured: boolean;
  readonly home: string;
}
interface HostMcpServer {
  readonly name: string;
  readonly tools: readonly string[];
}
interface HostCommandDescriptor {
  readonly name: string;
  readonly description: string;
  readonly input?: {
    readonly hint: string;
  };
}
type HostInitResult = {
  readonly status: 'created';
  readonly path: string;
} | {
  readonly status: 'exists';
  readonly path: string;
};
interface HostSessionModeSpec {
  readonly id: string;
  readonly label?: string;
  readonly plan?: boolean;
  readonly sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  readonly approval?: 'ask' | 'never';
}
interface HostProviderSetupRequest {
  readonly route: string;
  readonly profile: Record<string, unknown>;
  readonly credential?: {
    readonly ref: string;
    readonly value: string;
  };
}
/** Raised instead of ever attempting the corresponding operation locally. */
declare class RemoteHostOperationUnsupportedError extends Error {
  readonly operation: HostControlOperation;
  readonly reason: string;
  constructor(operation: HostControlOperation, reason: string);
}
/**
 * Remote-Agent mode operations. This class deliberately has no local executor,
 * filesystem, LLM, settings, or persistence fallback.
 */
declare class RemoteDshHostControlClient {
  readonly host: RemoteDshHostClient;
  private description;
  constructor(host: RemoteDshHostClient);
  describe(signal?: AbortSignal): Promise<HostControlDescription>;
  runShell(command: string, cwd: string, timeoutMs?: number, signal?: AbortSignal): Promise<HostShellResult>;
  doctor(sessionId?: string, cwd?: string, signal?: AbortSignal): Promise<HostDoctorResult>;
  mcp(sessionId: string, signal?: AbortSignal): Promise<{
    readonly servers: readonly HostMcpServer[];
  }>;
  commandCatalog(sessionId: string, signal?: AbortSignal): Promise<{
    readonly commands: readonly HostCommandDescriptor[];
  }>;
  init(cwd: string, content: string, signal?: AbortSignal): Promise<HostInitResult>;
  btw(sessionId: string, question: string, signal?: AbortSignal): Promise<{
    readonly answer: string | null;
    readonly error?: string;
  }>;
  setSessionMode(sessionId: string, spec: HostSessionModeSpec, signal?: AbortSignal): Promise<HostSessionModeSpec>;
  deleteSession(_sessionId: string, signal?: AbortSignal): Promise<never>;
  /**
   * Provider setup already rides the remote core domains. The returned client
   * is the same authenticated Host client; callers use llm/settings/credentials.
   */
  providerSetup(signal?: AbortSignal): Promise<RemoteDshHostClient>;
  setupProvider(request: HostProviderSetupRequest, signal?: AbortSignal): Promise<{
    readonly route: string;
  }>;
  private require;
}
//#endregion
export { HostCommandDescriptor, HostControlAvailability, HostControlDescription, HostControlOperation, HostDoctorResult, HostInitResult, HostMcpServer, HostProviderSetupRequest, HostSessionModeSpec, HostShellResult, RemoteDshHostControlClient, RemoteDshHostControlClient as default, RemoteHostOperationUnsupportedError };