import { RemoteSshManager } from "./manager.js";
import { Context } from "@deepseek-ai/cordis";
//#region src/transport/search.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteSshSearchHook: object;
  }
}
declare const name = "dsh-remote-ssh-search";
declare const inject: string[];
/** Inject one remote-aware branch into the stock parser before its module loads. */
declare function apply(ctx: Context): void;
/** Source transform is deliberately one insertion at the stock path parser entry. */
declare function injectSearchPathHook(source: string): string;
/** Return an absolute POSIX path for remote results; leave local paths to stock behavior. */
declare function remoteAbsolutePath(manager: RemoteSshManager, path: string, workdir: string): string | undefined;
//#endregion
export { apply, apply as default, inject, injectSearchPathHook, name, remoteAbsolutePath };