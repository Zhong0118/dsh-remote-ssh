import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { ShellExecRequest, ShellExecSpec, ShellExecutor, ShellProcess, ShellRunResult } from "@deepseek-ai/dsh-shell";
//#region src/routing/shell.d.ts
interface Config {
  dialect: 'bash' | 'pwsh';
  cwd?: string;
  timeoutMs?: number;
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
  maxSpillBytes?: number;
  graceMs?: number;
  executable?: string;
}
/** Syntax-specific shell provider over the cwd-routed subprocess service. */
declare class TransparentShellExecutor extends ShellExecutor {
  static inject: string[];
  static Config: z<Config>;
  private readonly config;
  private readonly manager;
  constructor(ctx: Context, config: Config);
  /** Remote and local routing is explicitly unconfined at the process layer. */
  get sandboxMode(): 'danger-full-access';
  resolve(request: ShellExecRequest): ShellExecSpec;
  run(spec: ShellExecSpec): Promise<ShellRunResult>;
  start(spec: ShellExecSpec): ShellProcess;
  private spawnSpec;
  private argv;
}
//#endregion
export { Config, TransparentShellExecutor, TransparentShellExecutor as default };