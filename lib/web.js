import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, posix, resolve, win32 } from "node:path";
import { access, appendFile, glob, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
//#region src/ssh/open-file.ts
const REMOTE_SSH_EXTENSIONS = /* @__PURE__ */ new Set(["ms-vscode-remote.remote-ssh", "jeanp413.open-remote-ssh"]);
const EDITORS = {
	vscode: {
		id: "vscode",
		command: "code",
		windowsLocations: (env) => compact([
			env.LOCALAPPDATA && resolve(env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
			env.ProgramW6432 && resolve(env.ProgramW6432, "Microsoft VS Code", "Code.exe"),
			env.ProgramFiles && resolve(env.ProgramFiles, "Microsoft VS Code", "Code.exe"),
			env["ProgramFiles(x86)"] && resolve(env["ProgramFiles(x86)"], "Microsoft VS Code", "Code.exe")
		]),
		macLocations: ["/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"]
	},
	cursor: {
		id: "cursor",
		command: "cursor",
		windowsLocations: (env) => compact([
			env.LOCALAPPDATA && resolve(env.LOCALAPPDATA, "Programs", "cursor", "Cursor.exe"),
			env.ProgramW6432 && resolve(env.ProgramW6432, "Cursor", "Cursor.exe"),
			env.ProgramFiles && resolve(env.ProgramFiles, "Cursor", "Cursor.exe")
		]),
		macLocations: ["/Applications/Cursor.app/Contents/Resources/app/bin/cursor"]
	},
	windsurf: {
		id: "windsurf",
		command: "windsurf",
		windowsLocations: (env) => compact([
			env.LOCALAPPDATA && resolve(env.LOCALAPPDATA, "Programs", "Windsurf", "Windsurf.exe"),
			env.ProgramW6432 && resolve(env.ProgramW6432, "Windsurf", "Windsurf.exe"),
			env.ProgramFiles && resolve(env.ProgramFiles, "Windsurf", "Windsurf.exe")
		]),
		macLocations: ["/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf"]
	},
	vscodium: {
		id: "vscodium",
		command: "codium",
		windowsLocations: (env) => compact([
			env.LOCALAPPDATA && resolve(env.LOCALAPPDATA, "Programs", "VSCodium", "VSCodium.exe"),
			env.ProgramW6432 && resolve(env.ProgramW6432, "VSCodium", "VSCodium.exe"),
			env.ProgramFiles && resolve(env.ProgramFiles, "VSCodium", "VSCodium.exe")
		]),
		macLocations: ["/Applications/VSCodium.app/Contents/Resources/app/bin/codium"]
	}
};
const AUTO_ORDER = [
	"vscode",
	"cursor",
	"windsurf",
	"vscodium"
];
const editorSupport = /* @__PURE__ */ new Map();
/** Open a remote path in a native VSC Remote-SSH window, downloading only as fallback. */
async function openRemoteFile(manager, workspaceId, inputPath) {
	const route = manager.workspace(workspaceId);
	const remotePath = route.mapper.toRemotePath(inputPath, route.aliasPath);
	const config = manager.snapshot();
	let fallbackReason;
	if (config.openFileMode !== "download") {
		const candidates = await editorCandidates(config.openFileMode, config.openFileEditorPath);
		for (const candidate of candidates) {
			if (!await supportsRemoteSsh(candidate)) {
				fallbackReason = `${candidate.id} does not have a Remote SSH extension`;
				continue;
			}
			try {
				await launchEditor(candidate, route.server.sshTarget, remotePath);
				return {
					kind: "editor",
					editor: candidate.id,
					remotePath
				};
			} catch (error) {
				fallbackReason = errorMessage$1(error);
			}
		}
		fallbackReason ??= "no supported VS Code-compatible editor was found";
	}
	return {
		kind: "download",
		localPath: await materializeRemoteFile(manager, workspaceId, remotePath, config.openFileDownloadMaxBytes),
		remotePath,
		...fallbackReason === void 0 ? {} : { fallbackReason }
	};
}
/** VS Code-compatible CLI arguments; each value is passed without a shell. */
function editorLaunchArgs(sshTarget, remotePath) {
	if (/[/\r\n\0]/.test(sshTarget)) throw new Error("SSH Host alias contains unsupported characters");
	if (!posix.isAbsolute(remotePath)) throw new Error(`remote open path must be absolute: ${remotePath}`);
	return [
		"--remote",
		`ssh-remote+${sshTarget}`,
		"--reuse-window",
		remotePath
	];
}
/** Preserve a useful extension while preventing cache traversal and Windows device names. */
function safeDownloadedName(remotePath) {
	let name = basename(remotePath).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
	if (name.length === 0) name = "remote-file";
	const stem = name.split(".", 1)[0]?.toUpperCase();
	if (stem !== void 0 && /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) name = `_${name}`;
	return name.slice(0, 180);
}
async function materializeRemoteFile(manager, workspaceId, remotePath, maxBytes) {
	const route = manager.workspace(workspaceId);
	const workspace = await manager.workspaceContext(route);
	const target = await workspace.fs.resolve(remotePath);
	const info = await workspace.fs.stat(target);
	if (info === void 0) throw new Error(`remote file does not exist: ${remotePath}`);
	if (info.type !== "file") throw new Error(`download fallback only supports files: ${remotePath}`);
	if (info.size !== void 0 && info.size > maxBytes) throw new Error(`remote file exceeds the download limit of ${String(maxBytes)} bytes: ${remotePath}`);
	const bytes = await workspace.fs.readBytes(target, void 0, maxBytes);
	const digest = createHash("sha256").update(bytes).digest("hex");
	const directory = resolve(tmpdir(), "dsh-remote-ssh", "open-file", workspaceId, digest.slice(0, 20));
	const localPath = resolve(directory, safeDownloadedName(remotePath));
	await mkdir(directory, { recursive: true });
	try {
		await writeFile(localPath, bytes, { flag: "wx" });
	} catch (error) {
		if (!isAlreadyExists(error)) throw error;
	}
	return localPath;
}
async function editorCandidates(mode, customPath) {
	if (mode === "custom") {
		if (customPath === void 0 || !isAbsolute(customPath) || !await executableExists(customPath)) return [];
		return [await editorInvocation("custom", customPath)];
	}
	const ids = mode === "auto" ? AUTO_ORDER : [mode];
	const found = [];
	for (const id of ids) {
		const executable = await findEditorExecutable(EDITORS[id]);
		if (executable !== void 0) found.push(await editorInvocation(id, executable));
	}
	return found;
}
async function editorInvocation(id, executable) {
	if (process.platform !== "win32" || !executable.toLowerCase().endsWith(".exe")) return {
		id,
		executable,
		prefixArgs: []
	};
	const cli = await findWindowsVscCli(executable);
	if (cli === void 0) return {
		id,
		executable,
		prefixArgs: []
	};
	return {
		id,
		executable,
		prefixArgs: [cli],
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1"
		}
	};
}
/** Resolve the versioned CLI entry used by VSC application executables on Windows. */
async function findWindowsVscCli(executable) {
	const root = dirname(executable);
	const direct = resolve(root, "resources", "app", "out", "cli.js");
	if (await pathExists(direct)) return direct;
	let children;
	try {
		children = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
	} catch {
		return;
	}
	for (const child of children) {
		const candidate = resolve(root, child, "resources", "app", "out", "cli.js");
		if (await pathExists(candidate)) return candidate;
	}
}
async function findEditorExecutable(editor) {
	const pathCandidate = await findExecutableOnPath(editor.command);
	if (pathCandidate !== void 0) return pathCandidate;
	const candidates = process.platform === "win32" ? editor.windowsLocations(process.env) : process.platform === "darwin" ? editor.macLocations : [];
	for (const candidate of candidates) if (await executableExists(candidate)) return candidate;
}
async function findExecutableOnPath(command) {
	const suffixes = process.platform === "win32" ? [".exe"] : [""];
	for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) for (const suffix of suffixes) {
		const candidate = resolve(directory, `${command}${suffix}`);
		if (await executableExists(candidate)) return candidate;
	}
}
async function executableExists(path) {
	try {
		await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
async function pathExists(path) {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}
async function supportsRemoteSsh(editor) {
	const key = JSON.stringify([editor.executable, editor.prefixArgs]);
	let pending = editorSupport.get(key);
	if (pending === void 0) {
		pending = capture(editor, ["--list-extensions"], 8e3).then((output) => {
			return output.split(/\r?\n/).map((value) => value.trim().toLowerCase()).filter(Boolean).some((extension) => REMOTE_SSH_EXTENSIONS.has(extension) || extension.endsWith(".remote-ssh"));
		}, () => false);
		editorSupport.set(key, pending);
	}
	return pending;
}
async function launchEditor(editor, sshTarget, remotePath) {
	const child = spawn(editor.executable, [...editor.prefixArgs, ...editorLaunchArgs(sshTarget, remotePath)], {
		detached: true,
		windowsHide: true,
		stdio: "ignore",
		...editor.env === void 0 ? {} : { env: editor.env }
	});
	await new Promise((resolvePromise, reject) => {
		let settled = false;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error === void 0) resolvePromise();
			else reject(error);
		};
		const timer = setTimeout(() => {
			child.unref();
			finish();
		}, 1500);
		child.once("error", (error) => {
			finish(error);
		});
		child.once("close", (code) => {
			if (code === 0) finish();
			else finish(/* @__PURE__ */ new Error(`editor exited with code ${String(code)}`));
		});
	});
}
async function capture(editor, args, timeoutMs) {
	const child = spawn(editor.executable, [...editor.prefixArgs, ...args], {
		windowsHide: true,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		],
		...editor.env === void 0 ? {} : { env: editor.env }
	});
	const chunks = [];
	let size = 0;
	child.stdout.on("data", (chunk) => {
		if (size >= 1048576) return;
		chunks.push(chunk.subarray(0, 1048576 - size));
		size += chunk.length;
	});
	const timer = setTimeout(() => {
		child.kill();
	}, timeoutMs);
	const code = await new Promise((resolvePromise, reject) => {
		child.once("error", reject);
		child.once("close", resolvePromise);
	}).finally(() => {
		clearTimeout(timer);
	});
	if (code !== 0) throw new Error(`editor probe exited with code ${String(code)}`);
	return Buffer.concat(chunks).toString("utf8");
}
function compact(values) {
	return values.filter((value) => value !== void 0);
}
function isAlreadyExists(error) {
	return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
function errorMessage$1(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/ssh/config.ts
/** Default OpenSSH user config used by VS Code Remote - SSH as well. */
function defaultSshConfigFiles() {
	return process.platform === "win32" ? [resolve(homedir(), ".ssh", "config"), resolve(process.env.ProgramData ?? String.raw`C:\ProgramData`, "ssh", "ssh_config")] : [resolve(homedir(), ".ssh", "config"), "/etc/ssh/ssh_config"];
}
/** Stable settings-safe id for a config alias promoted by a workspace. */
function discoveredSshServerId(sshTarget) {
	return `ssh-config-${createHash("sha256").update(sshTarget).digest("hex").slice(0, 20)}`;
}
/** Discover concrete Host aliases, recursively expanding Include directives. */
async function discoverSshConfigHosts(configFiles = defaultSshConfigFiles()) {
	const hosts = /* @__PURE__ */ new Map();
	const visited = /* @__PURE__ */ new Set();
	const files = [];
	const errors = [];
	const visit = async (configPath, required) => {
		const absolute = resolve(expandHome(configPath));
		const key = process.platform === "win32" ? absolute.toLowerCase() : absolute;
		if (visited.has(key)) return;
		visited.add(key);
		let source;
		try {
			source = await readFile(absolute, "utf8");
		} catch (error) {
			const code = errorCode(error);
			if (required || code !== "ENOENT" && code !== "ENOTDIR") errors.push(`${absolute}: ${errorMessage(error)}`);
			return;
		}
		files.push(absolute);
		let active = [];
		for (const rawLine of source.split(/\r?\n/)) {
			const tokens = tokenizeSshConfigLine(rawLine);
			if (tokens.length === 0) continue;
			const [keyword, args] = splitKeyword(tokens);
			const lower = keyword.toLowerCase();
			if (lower === "include") {
				for (const pattern of args) {
					const matches = await expandInclude(pattern, dirname(absolute));
					for (const match of matches) await visit(match, false);
				}
				continue;
			}
			if (lower === "match") {
				active = [];
				continue;
			}
			if (lower === "host") {
				active = [];
				for (const alias of args) {
					if (!isConcreteAlias(alias)) continue;
					let host = hosts.get(alias);
					if (host === void 0) {
						host = {
							id: discoveredSshServerId(alias),
							label: alias,
							sshTarget: alias,
							configPath: absolute
						};
						hosts.set(alias, host);
					}
					active.push(host);
				}
				continue;
			}
			if (active.length === 0 || args[0] === void 0) continue;
			if (lower === "hostname") for (const host of active) host.hostName ??= args[0];
			else if (lower === "user") for (const host of active) host.user ??= args[0];
			else if (lower === "port") {
				const port = Number(args[0]);
				if (Number.isSafeInteger(port) && port > 0 && port <= 65535) for (const host of active) host.port ??= port;
			}
		}
	};
	for (const configPath of configFiles) await visit(configPath, false);
	return {
		hosts: [...hosts.values()].sort((left, right) => left.label.localeCompare(right.label)),
		files,
		errors
	};
}
/** Parse a VS Code-style `ssh user@host -p 22` connection command. */
function parseSshConnectionCommand(command) {
	if (/\r|\n/.test(command)) throw new Error("SSH connection command must be one line");
	const argv = tokenizeSshConfigLine(command);
	const executable = argv.shift();
	if (executable === void 0 || !/^ssh(?:\.exe)?$/i.test(win32.basename(executable)) && basename(executable) !== "ssh") throw new Error("SSH connection command must start with ssh");
	let user;
	let port;
	let identityFile;
	let destination;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const value = () => {
			const next = argv[index + 1];
			if (next === void 0) throw new Error(`missing value for ${argument}`);
			index += 1;
			return next;
		};
		if (argument === "-p") port = parsePort(value());
		else if (argument === "-l") user = value();
		else if (argument === "-i") identityFile = value();
		else if (argument === "-o") {
			const option = value();
			const separator = option.indexOf("=");
			const key = (separator < 0 ? option : option.slice(0, separator)).toLowerCase();
			const optionValue = separator < 0 ? "" : option.slice(separator + 1);
			if (key === "user") user = requiredOptionValue(option, optionValue);
			else if (key === "port") port = parsePort(requiredOptionValue(option, optionValue));
			else if (key === "identityfile") identityFile = requiredOptionValue(option, optionValue);
			else if (key !== "hostname") throw new Error(`unsupported SSH option '${option}'`);
		} else if (argument.startsWith("-")) throw new Error(`unsupported SSH argument '${argument}'`);
		else if (destination === void 0) destination = argument;
		else throw new Error("SSH connection command has more than one destination");
	}
	if (destination === void 0) throw new Error("SSH connection command requires a destination");
	const at = destination.lastIndexOf("@");
	if (at >= 0) {
		user ??= destination.slice(0, at);
		destination = destination.slice(at + 1);
	}
	if (destination === "" || /\s|[*?!\[\]]/.test(destination)) throw new Error("SSH destination must be one concrete host");
	if (user !== void 0 && (user === "" || /\s/.test(user))) throw new Error("SSH user is invalid");
	return {
		alias: destination,
		hostName: destination,
		...user === void 0 ? {} : { user },
		...port === void 0 ? {} : { port },
		...identityFile === void 0 ? {} : { identityFile }
	};
}
/** Append a parsed host to one selected OpenSSH config file. */
async function appendSshHost(configPath, command) {
	const absolute = resolve(expandHome(configPath));
	const host = parseSshConnectionCommand(command);
	if ((await discoverSshConfigHosts([absolute])).hosts.some((candidate) => candidate.sshTarget === host.alias)) throw new Error(`SSH Host '${host.alias}' already exists in ${absolute}`);
	await mkdir(dirname(absolute), { recursive: true });
	let prefix = "";
	try {
		const current = await readFile(absolute);
		if (current.length > 0 && current.at(-1) !== 10) prefix = "\n";
	} catch (error) {
		if (errorCode(error) !== "ENOENT") throw error;
	}
	const lines = [
		`${prefix}Host ${host.alias}`,
		`  HostName ${formatSshValue(host.hostName)}`,
		...host.user === void 0 ? [] : [`  User ${formatSshValue(host.user)}`],
		...host.port === void 0 ? [] : [`  Port ${host.port}`],
		...host.identityFile === void 0 ? [] : [`  IdentityFile ${formatSshValue(host.identityFile)}`],
		""
	];
	await appendFile(absolute, lines.join("\n"), "utf8");
	return host;
}
function splitKeyword(tokens) {
	const first = tokens[0] ?? "";
	const equals = first.indexOf("=");
	if (equals < 0) return [first, tokens.slice(1)];
	return [first.slice(0, equals), [first.slice(equals + 1), ...tokens.slice(1)].filter(Boolean)];
}
function tokenizeSshConfigLine(line) {
	const tokens = [];
	let token = "";
	let quote;
	let escaped = false;
	const push = () => {
		if (token !== "") tokens.push(token);
		token = "";
	};
	for (const character of line.trim()) if (escaped) {
		token += character;
		escaped = false;
	} else if (character === "\\") escaped = true;
	else if (quote !== void 0) {
		if (character === quote) quote = void 0;
		else token += character;
	} else if (character === "\"" || character === "'") quote = character;
	else if (character === "#") break;
	else if (/\s/.test(character)) push();
	else token += character;
	if (escaped) token += "\\";
	push();
	return tokens;
}
function isConcreteAlias(alias) {
	return alias !== "" && !alias.startsWith("!") && !/[*?\[]/.test(alias);
}
async function expandInclude(pattern, baseDir) {
	const expanded = expandHome(pattern);
	const absolute = isAbsolute(expanded) ? expanded : resolve(baseDir, expanded);
	const matches = [];
	try {
		for await (const match of glob(absolute.replaceAll("\\", "/"))) matches.push(resolve(match));
	} catch {}
	return matches.sort();
}
function expandHome(path) {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) return resolve(homedir(), path.slice(2));
	return path;
}
function errorCode(error) {
	return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function parsePort(value) {
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error(`invalid SSH port '${value}'`);
	return port;
}
function requiredOptionValue(option, value) {
	if (value === "") throw new Error(`SSH option '${option}' requires =value`);
	return value;
}
function formatSshValue(value) {
	return /\s|#/.test(value) ? `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"` : value;
}
//#endregion
//#region src/profiles/web.ts
const REMOTE_SSH_STATE_PATH = "/plugins/dsh-remote-ssh/state";
const REMOTE_SSH_SERVER_PATH = "/plugins/dsh-remote-ssh/server";
const REMOTE_SSH_SERVER_REMOVE_PATH = "/plugins/dsh-remote-ssh/server/remove";
const REMOTE_SSH_WORKSPACE_PATH = "/plugins/dsh-remote-ssh/workspace";
const REMOTE_SSH_WORKSPACE_REMOVE_PATH = "/plugins/dsh-remote-ssh/workspace/remove";
const REMOTE_SSH_LOCAL_WORKSPACE_PATH = "/plugins/dsh-remote-ssh/local-workspace";
const REMOTE_SSH_PROBE_PATH = "/plugins/dsh-remote-ssh/probe";
const REMOTE_SSH_CONFIG_HOST_PATH = "/plugins/dsh-remote-ssh/ssh-config/host";
const REMOTE_SSH_SETTINGS_PATH = "/plugins/dsh-remote-ssh/settings";
const REMOTE_SSH_DIRECTORY_PATH = "/plugins/dsh-remote-ssh/directory";
const REMOTE_SSH_OPEN_FILE_PATH = "/plugins/dsh-remote-ssh/open-file";
const REMOTE_SSH_BACKEND_CONNECT_PATH = "/plugins/dsh-remote-ssh/backend/connect";
const name = "dsh-remote-ssh-web";
const inject = ["remoteSshManager"];
/** Activate the Web surface only in compositions that provide a Web host. */
function apply(ctx) {
	ctx.inject(["webServer"], registerWebRoutes);
}
/** Register same-origin catalog mutation and connection-probe endpoints. */
function registerWebRoutes(ctx) {
	const routes = [
		route(ctx, REMOTE_SSH_STATE_PATH, "GET", async (_req, res) => {
			json(res, 200, await catalogState(ctx.remoteSshManager));
		}),
		route(ctx, REMOTE_SSH_SETTINGS_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			const sshConfigFile = optionalString(body, "sshConfigFile");
			const openFileEditorPath = optionalString(body, "openFileEditorPath");
			const openFileMode = body.openFileMode === void 0 ? void 0 : parseOpenFileMode(body.openFileMode);
			await ctx.remoteSshManager.updateUserPreferences({
				...sshConfigFile === void 0 ? {} : { sshConfigFile },
				...openFileMode === void 0 ? {} : { openFileMode },
				...openFileEditorPath === void 0 ? {} : { openFileEditorPath }
			});
			const snapshot = ctx.remoteSshManager.snapshot();
			json(res, 200, {
				sshConfigFile: snapshot.sshConfigFile,
				openFileMode: snapshot.openFileMode,
				openFileEditorPath: snapshot.openFileEditorPath
			});
		}),
		route(ctx, REMOTE_SSH_DIRECTORY_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			const server = await resolveAvailableServer(ctx.remoteSshManager, requiredString(body, "serverId"));
			const path = body.path;
			if (path !== void 0 && typeof path !== "string") throw new Error("path must be a string");
			json(res, 200, await ctx.remoteSshManager.listRemoteDirectory(server, path));
		}),
		route(ctx, REMOTE_SSH_OPEN_FILE_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			json(res, 200, await openRemoteFile(ctx.remoteSshManager, requiredString(body, "workspaceId"), requiredString(body, "path")));
		}),
		route(ctx, REMOTE_SSH_WORKSPACE_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			const server = await resolveAvailableServer(ctx.remoteSshManager, requiredString(body, "serverId"));
			const configured = ctx.remoteSshManager.snapshot().servers.find((candidate) => candidate.id === server.id) ?? await ctx.remoteSshManager.addServer({
				id: server.id,
				label: server.label,
				sshTarget: server.sshTarget
			});
			const created = await ctx.remoteSshManager.addWorkspace(configured.id, requiredString(body, "remotePath"));
			json(res, 201, {
				id: created.workspace.id,
				aliasPath: created.aliasPath
			});
		}),
		route(ctx, REMOTE_SSH_WORKSPACE_REMOVE_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			json(res, 200, { removed: await ctx.remoteSshManager.removeWorkspace(requiredString(body, "id")) });
		}),
		route(ctx, REMOTE_SSH_LOCAL_WORKSPACE_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			json(res, 200, { path: await ctx.remoteSshManager.adoptLocalWorkspace(requiredString(body, "path")) });
		}),
		route(ctx, REMOTE_SSH_PROBE_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			const server = await resolveAvailableServer(ctx.remoteSshManager, requiredString(body, "id"));
			json(res, 200, await probeServer(server.sshTarget, server.sshArgs ?? []));
		}),
		route(ctx, REMOTE_SSH_BACKEND_CONNECT_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			const server = await resolveAvailableServer(ctx.remoteSshManager, requiredString(body, "id"));
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-store",
				"x-content-type-options": "nosniff"
			});
			res.flushHeaders();
			const send = (value) => {
				if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(value)}\n`);
			};
			const unwatch = ctx.remoteSshManager.watchBackendProgress(server, (progress) => {
				send({
					type: "progress",
					stage: progress.stage
				});
			});
			try {
				const backend = await ctx.remoteSshManager.connectWebBackend(server, ctx.webServer.port);
				send({
					type: "ready",
					url: backend.url,
					localPort: backend.localPort,
					remotePort: backend.remotePort
				});
			} catch (error) {
				send({
					type: "error",
					error: safeMessage(error)
				});
			} finally {
				unwatch();
				if (!res.destroyed && !res.writableEnded) res.end();
			}
		}),
		route(ctx, REMOTE_SSH_CONFIG_HOST_PATH, "POST", async (req, res) => {
			const body = await readJson(req);
			const configPath = resolve(requiredString(body, "configPath"));
			if (!activeConfigFiles(ctx.remoteSshManager).some((candidate) => samePath(candidate, configPath))) throw new Error("selected SSH config file is not active");
			json(res, 201, await appendSshHost(configPath, requiredString(body, "command")));
		})
	];
	ctx.effect(() => () => {
		for (const dispose of routes) dispose();
	}, "Remote SSH Web routes");
}
async function catalogState(manager) {
	const snapshot = manager.snapshot();
	const configFiles = activeConfigFiles(manager);
	const discovery = await discoverSshConfigHosts(configFiles);
	const servers = snapshot.servers.map((server) => ({
		...server,
		source: "saved"
	}));
	for (const discovered of discovery.hosts) {
		const configured = servers.find((server) => server.sshTarget === discovered.sshTarget);
		if (configured === void 0) servers.push({
			...discovered,
			source: "ssh-config"
		});
		else Object.assign(configured, {
			source: "ssh-config",
			configPath: discovered.configPath,
			...discovered.hostName === void 0 ? {} : { hostName: discovered.hostName },
			...discovered.user === void 0 ? {} : { user: discovered.user },
			...discovered.port === void 0 ? {} : { port: discovered.port }
		});
	}
	return {
		servers,
		workspaces: snapshot.workspaces.map((workspace) => ({
			...workspace,
			aliasPath: manager.workspace(workspace.id).aliasPath
		})),
		serverCount: servers.length,
		discoveredServerCount: discovery.hosts.length,
		workspaceCount: snapshot.workspaces.length,
		configFiles,
		loadedConfigFiles: discovery.files,
		configErrors: discovery.errors,
		customConfigFile: snapshot.sshConfigFile,
		openFileMode: snapshot.openFileMode,
		openFileEditorPath: snapshot.openFileEditorPath
	};
}
async function resolveAvailableServer(manager, id) {
	const server = (await catalogState(manager)).servers.find((candidate) => candidate.id === id);
	if (server === void 0) throw new Error("SSH host is no longer present in the active config");
	return server;
}
function activeConfigFiles(manager) {
	const custom = manager.snapshot().sshConfigFile;
	return custom === void 0 || custom.trim() === "" ? defaultSshConfigFiles() : [resolve(custom)];
}
function samePath(left, right) {
	return process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
}
function route(ctx, path, method, handler) {
	return ctx.webServer.register({
		kind: "exact",
		path,
		handler: async (req, res) => {
			if (req.method !== method) return json(res, 405, { error: "method not allowed" });
			if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
			try {
				await handler(req, res);
			} catch (error) {
				if (!res.headersSent) json(res, 400, { error: safeMessage(error) });
				else if (!res.writableEnded) res.end();
			}
		}
	});
}
async function readJson(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += bytes.length;
		if (size > 65536) throw new Error("request body exceeds 64 KiB");
		chunks.push(bytes);
	}
	const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("request body must be an object");
	return value;
}
function requiredString(body, key) {
	const value = body[key];
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} must be a non-empty string`);
	return value;
}
function optionalString(body, key) {
	const value = body[key];
	if (value === void 0) return void 0;
	if (typeof value !== "string") throw new Error(`${key} must be a string`);
	return value;
}
function parseOpenFileMode(value) {
	if (value === "auto" || value === "vscode" || value === "cursor" || value === "windsurf" || value === "vscodium" || value === "custom" || value === "download") return value;
	throw new Error("openFileMode is invalid");
}
function trustedRequest(req) {
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const host = req.headers.host;
	const origin = req.headers.origin;
	if (host === void 0 || origin === void 0) return origin === void 0;
	try {
		return new URL(origin).host === new URL(`http://${host}`).host;
	} catch {
		return false;
	}
}
function json(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).slice(0, 1e3);
}
async function probeServer(sshTarget, sshArgs) {
	const command = "printf \"hostname=%s\\n\" \"$(hostname)\"; for dsh_cmd in bash pwsh rg code; do if command -v \"$dsh_cmd\" >/dev/null 2>&1; then printf \"%s=1\\n\" \"$dsh_cmd\"; else printf \"%s=0\\n\" \"$dsh_cmd\"; fi; done";
	const child = spawn("ssh", [
		...sshArgs,
		"-T",
		"-o",
		"BatchMode=yes",
		"-o",
		"ConnectTimeout=5",
		sshTarget,
		command
	], {
		windowsHide: true,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	const stdout = [];
	const stderr = [];
	child.stdout.on("data", (chunk) => {
		stdout.push(chunk);
	});
	child.stderr.on("data", (chunk) => {
		stderr.push(chunk);
	});
	const timer = setTimeout(() => {
		child.kill();
	}, 8e3);
	const code = await new Promise((resolvePromise, reject) => {
		child.once("error", reject);
		child.once("close", resolvePromise);
	}).finally(() => {
		clearTimeout(timer);
	});
	const output = Buffer.concat(stdout).toString("utf8");
	if (code !== 0) return {
		reachable: false,
		error: Buffer.concat(stderr).toString("utf8").trim().slice(0, 500) || `ssh exit ${code}`
	};
	const facts = Object.fromEntries(output.trim().split(/\r?\n/).map((line) => line.split("=", 2)));
	return {
		reachable: true,
		...facts.hostname === void 0 ? {} : { hostname: facts.hostname },
		commands: Object.fromEntries([
			"bash",
			"pwsh",
			"rg",
			"code"
		].map((name) => [name, facts[name] === "1"]))
	};
}
//#endregion
export { REMOTE_SSH_BACKEND_CONNECT_PATH, REMOTE_SSH_CONFIG_HOST_PATH, REMOTE_SSH_DIRECTORY_PATH, REMOTE_SSH_LOCAL_WORKSPACE_PATH, REMOTE_SSH_OPEN_FILE_PATH, REMOTE_SSH_PROBE_PATH, REMOTE_SSH_SERVER_PATH, REMOTE_SSH_SERVER_REMOVE_PATH, REMOTE_SSH_SETTINGS_PATH, REMOTE_SSH_STATE_PATH, REMOTE_SSH_WORKSPACE_PATH, REMOTE_SSH_WORKSPACE_REMOVE_PATH, apply, inject, name };
