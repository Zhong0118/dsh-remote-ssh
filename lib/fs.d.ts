import { FsBytesWriteOutcome } from "./binary-fs.js";
import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { FileSystem, FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsVersion, FsWriteIntent, FsWriteOutcome } from "@deepseek-ai/dsh-fs";
import { SandboxExecutionPolicy } from "@deepseek-ai/dsh-sandbox";
//#region src/transport/fs.d.ts
interface Config {
  diffBasisMaxBytes?: number;
  maxReadBytes?: number;
  localWorkspace?: string;
  remoteWorkspace?: string;
}
interface ResolvedConfig extends Config {
  diffBasisMaxBytes: number;
  maxReadBytes: number;
}
declare class RemoteSshFileSystem extends FileSystem {
  static inject: string[];
  static Config: z<Config>;
  readonly config: ResolvedConfig;
  private readonly remote;
  private readonly mapper;
  private readonly locks;
  constructor(ctx: Context, config: Config);
  resolve(path: string, opts?: {
    cwd?: string;
    signal?: AbortSignal;
  }): Promise<FsTarget>;
  processPath(target: FsTarget): string;
  fileUrl(target: FsTarget): string;
  contains(parent: FsTarget, child: FsTarget): boolean;
  stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>;
  lstat(path: string, opts?: {
    cwd?: string;
  }, signal?: AbortSignal): Promise<FsPathInfo | undefined>;
  readText(target: FsTarget, signal?: AbortSignal): Promise<string>;
  streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>;
  readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
  listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>;
  writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsWriteOutcome>;
  writeBytes(target: FsTarget, content: Uint8Array, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsBytesWriteOutcome>;
  editText(target: FsTarget, edit: FsEditRequest, expected?: {
    version: ReturnType<typeof FsVersion>;
  }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsEditOutcome>;
  private target;
  private resolveUri;
  private probe;
  private withLock;
}
//#endregion
export { Config, RemoteSshFileSystem, RemoteSshFileSystem as default };