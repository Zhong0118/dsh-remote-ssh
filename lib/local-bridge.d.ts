import { Context } from "@deepseek-ai/cordis";
import { FileSystem } from "@deepseek-ai/dsh-fs";
import { SubprocessRuntime } from "@deepseek-ai/dsh-subprocess";
import { SpillStore } from "@deepseek-ai/dsh-spill";
//#region src/routing/local-bridge.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    localFs: FileSystem;
    localSpillStore: SpillStore;
    localSubprocess: SubprocessRuntime;
  }
}
/** Capture isolated local providers under names the root routers can consume. */
declare const name = "remote-ssh-local-bridge";
declare const inject: string[];
/** Publish isolated local providers without changing their implementation. */
declare function apply(ctx: Context): void;
//#endregion
export { apply, inject, name };