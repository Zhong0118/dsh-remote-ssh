import { Context } from "@deepseek-ai/cordis";
//#region src/profiles/web.d.ts
declare const REMOTE_SSH_STATE_PATH = "/plugins/dsh-remote-ssh/state";
declare const REMOTE_SSH_SERVER_PATH = "/plugins/dsh-remote-ssh/server";
declare const REMOTE_SSH_SERVER_REMOVE_PATH = "/plugins/dsh-remote-ssh/server/remove";
declare const REMOTE_SSH_WORKSPACE_PATH = "/plugins/dsh-remote-ssh/workspace";
declare const REMOTE_SSH_WORKSPACE_REMOVE_PATH = "/plugins/dsh-remote-ssh/workspace/remove";
declare const REMOTE_SSH_LOCAL_WORKSPACE_PATH = "/plugins/dsh-remote-ssh/local-workspace";
declare const REMOTE_SSH_PROBE_PATH = "/plugins/dsh-remote-ssh/probe";
declare const REMOTE_SSH_CONFIG_HOST_PATH = "/plugins/dsh-remote-ssh/ssh-config/host";
declare const REMOTE_SSH_SETTINGS_PATH = "/plugins/dsh-remote-ssh/settings";
declare const REMOTE_SSH_DIRECTORY_PATH = "/plugins/dsh-remote-ssh/directory";
declare const REMOTE_SSH_OPEN_FILE_PATH = "/plugins/dsh-remote-ssh/open-file";
declare const name = "dsh-remote-ssh-web";
declare const inject: string[];
/** Activate the Web surface only in compositions that provide a Web host. */
declare function apply(ctx: Context): void;
//#endregion
export { REMOTE_SSH_CONFIG_HOST_PATH, REMOTE_SSH_DIRECTORY_PATH, REMOTE_SSH_LOCAL_WORKSPACE_PATH, REMOTE_SSH_OPEN_FILE_PATH, REMOTE_SSH_PROBE_PATH, REMOTE_SSH_SERVER_PATH, REMOTE_SSH_SERVER_REMOVE_PATH, REMOTE_SSH_SETTINGS_PATH, REMOTE_SSH_STATE_PATH, REMOTE_SSH_WORKSPACE_PATH, REMOTE_SSH_WORKSPACE_REMOVE_PATH, apply, inject, name };