import { RemoteSshManager, RemoteWorkspaceRoute } from "./manager.js";
import { Context } from "@deepseek-ai/cordis";
import { PassThrough, Writable } from "node:stream";
import { SubprocessHandle, SubprocessOutcome, SubprocessRuntime, SubprocessSpawnSpec, SubprocessTerminalForeground, SubprocessTerminalHandle, SubprocessTerminalSignal, SubprocessTerminalSpawnSpec } from "@deepseek-ai/dsh-subprocess";
//#region src/routing/subprocess.d.ts
/** Subprocess router that selects the host from `spec.cwd`, never tool identity. */
declare class TransparentSubprocessRuntime extends SubprocessRuntime {
  static inject: string[];
  private readonly local;
  private readonly manager;
  private readonly remoteHandles;
  private readonly remoteTerminals;
  constructor(ctx: Context);
  resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>;
  spawn(spec: SubprocessSpawnSpec): SubprocessHandle;
  spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>;
}
/** All ordinary remote subprocess modes stay on the persistent AHP host. */
declare function canUseAhpSubprocess(_spec: SubprocessSpawnSpec): boolean;
/** Interactive terminal over the same persistent AHP host connection. */
declare class RemoteAhpTerminalHandle implements SubprocessTerminalHandle {
  private readonly client;
  private readonly channel;
  private readonly subscription;
  readonly pid = -1;
  readonly output: PassThrough;
  readonly done: Promise<SubprocessOutcome>;
  private stopping;
  private readonly stopped;
  private terminating;
  private constructor();
  static create(route: RemoteWorkspaceRoute, workspace: Awaited<ReturnType<RemoteSshManager['workspaceContext']>>, spec: SubprocessTerminalSpawnSpec): Promise<RemoteAhpTerminalHandle>;
  write(data: string): Promise<void>;
  inspectForeground(): Promise<SubprocessTerminalForeground | undefined>;
  signalForeground(signal: SubprocessTerminalSignal): Promise<number>;
  terminate(): Promise<void>;
  private pump;
}
/** Writable exposed synchronously while its remote AHP input pump boots. */
declare class DeferredAhpStdin extends Writable {
  private readonly binding;
  private resolveBinding;
  private rejectBinding;
  private bound;
  private remoteFinished;
  constructor();
  bind(terminal: RemoteAhpTerminalHandle, endMarker: string): void;
  fail(reason: unknown): void;
  finishRemote(): void;
  _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
  _final(callback: (error?: Error | null) => void): void;
  private sendChunk;
}
declare function buildRemoteProcessCommand(argv: readonly string[], env: NodeJS.ProcessEnv | Readonly<Record<string, string>> | undefined, stdinPath: string, stdoutPath: string, stderrPath: string): string;
declare function buildRemoteInteractiveCommand(argv: readonly string[], env: Readonly<Record<string, string>> | undefined): string;
/** Decode newline-delimited base64 records until the unguessable EOF marker. */
declare function buildRemoteStdinWriterCommand(fifoPath: string, endMarker: string): string;
//#endregion
export { DeferredAhpStdin, TransparentSubprocessRuntime, TransparentSubprocessRuntime as default, buildRemoteInteractiveCommand, buildRemoteProcessCommand, buildRemoteStdinWriterCommand, canUseAhpSubprocess };