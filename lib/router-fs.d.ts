import { FsBytesWriteOutcome } from "./binary-fs.js";
import { Context } from "@deepseek-ai/cordis";
import { FileSystem, FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsVersion, FsWriteIntent, FsWriteOutcome } from "@deepseek-ai/dsh-fs";
import { SandboxExecutionPolicy } from "@deepseek-ai/dsh-sandbox";
//#region src/routing/fs.d.ts
/** Filesystem router that keeps ordinary fs tools unchanged across execution worlds. */
declare class TransparentFileSystem extends FileSystem {
  static inject: string[];
  private readonly local;
  private readonly manager;
  constructor(ctx: Context);
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
  readByteRange(target: FsTarget, range: {
    offset: number;
    length: number;
  }, signal?: AbortSignal): Promise<Uint8Array>;
  listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>;
  writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsWriteOutcome>;
  writeBytes(target: FsTarget, content: Uint8Array, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsBytesWriteOutcome>;
  editText(target: FsTarget, edit: FsEditRequest, expected?: {
    version: FsVersion;
  }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsEditOutcome>;
  private backend;
}
//#endregion
export { TransparentFileSystem, TransparentFileSystem as default };