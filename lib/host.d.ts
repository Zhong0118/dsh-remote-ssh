import { Context } from "@deepseek-ai/cordis";
//#region src/profiles/host.d.ts
/** Stable root entry whose package manifest contributes the browser module. */
declare const name = "dsh-remote-ssh-host";
/** Node-side no-op; runtime capabilities are mounted through explicit subpath rows. */
declare function apply(_ctx: Context): void;
//#endregion
export { apply, name };