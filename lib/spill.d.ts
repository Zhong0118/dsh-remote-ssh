import { RemoteSshManager, RemoteWorkspaceRoute } from "./manager.js";
import { Context } from "@deepseek-ai/cordis";
import { SaveTextSpill, SpillRef, SpillStore } from "@deepseek-ai/dsh-spill";
//#region src/routing/spill.d.ts
declare const name = "dsh-remote-ssh-spill";
declare const inject: string[];
/** Route spill artifacts with the session execution world without exposing host files. */
declare class TransparentSpillStore extends SpillStore {
  static inject: string[];
  private readonly local;
  private readonly manager;
  constructor(ctx: Context);
  saveText(input: SaveTextSpill): Promise<SpillRef>;
}
/** Persist one spill through the already-authorized AHP host connection. */
declare function saveRemoteSpill(manager: Pick<RemoteSshManager, 'workspaceContext' | 'workspaceShell'>, route: RemoteWorkspaceRoute, input: SaveTextSpill): Promise<SpillRef>;
/** Stable private directory for one session inside this process's remote runtime root. */
declare function remoteSpillDirectory(runtimeRoot: string, sessionId: string): string;
/** Suggested names are labels only; randomness supplies identity and collision resistance. */
declare function safeSuggestedName(value: string): string;
//#endregion
export { TransparentSpillStore, TransparentSpillStore as default, inject, name, remoteSpillDirectory, safeSuggestedName, saveRemoteSpill };