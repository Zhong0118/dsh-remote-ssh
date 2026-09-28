import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { ShellExecRequest, ShellExecSpec, ShellExecution, ShellExecutor } from "@deepseek-ai/dsh-shell";
//#region src/transport/shell.d.ts
interface Config {
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  outputMaxBytes?: number;
  maxOutputMaxBytes?: number;
  shellCommand?: string;
  localWorkspace?: string;
  remoteWorkspace?: string;
}
interface ResolvedConfig extends Config {
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  outputMaxBytes: number;
  maxOutputMaxBytes: number;
  shellCommand: string;
}
declare class RemoteSshShellExecutor extends ShellExecutor {
  static inject: string[];
  static Config: z<Config>;
  readonly config: ResolvedConfig;
  private readonly remote;
  private readonly mapper;
  private readonly processes;
  constructor(ctx: Context, config: Config);
  resolve(request: ShellExecRequest): ShellExecSpec;
  execute(spec: ShellExecSpec): Promise<ShellExecution>;
  private validate;
}
//#endregion
export { Config, RemoteSshShellExecutor, RemoteSshShellExecutor as default };