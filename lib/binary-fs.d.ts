import { FileSystem, FsTarget, FsVersion, FsWriteIntent } from "@deepseek-ai/dsh-fs";
import { SandboxExecutionPolicy } from "@deepseek-ai/dsh-sandbox";
//#region src/transport/binary-fs.d.ts
/** Result returned after a complete binary file is atomically published. */
interface FsBytesWriteOutcome {
  operation: 'create' | 'update';
  version: FsVersion;
  bytes: number;
}
/** Runtime view of a filesystem implementing the pending upstream binary-write API. */
type BinaryWritableFileSystem = FileSystem & {
  writeBytes(target: FsTarget, content: Uint8Array, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsBytesWriteOutcome>;
};
/** Require binary publication without falling back to a host path or subprocess. */
declare function binaryWriter(fs: FileSystem): BinaryWritableFileSystem;
//#endregion
export { BinaryWritableFileSystem, FsBytesWriteOutcome, binaryWriter };