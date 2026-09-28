import z from "@deepseek-ai/schemastery";
import { ShellExecutor } from "@deepseek-ai/dsh-shell";
//#region src/routing/shell.ts
const PWSH_PREAMBLE = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); ";
/** Syntax-specific shell provider over the cwd-routed subprocess service. */
var TransparentShellExecutor = class extends ShellExecutor {
	static inject = ["subprocess", "remoteSshManager"];
	static Config = z.object({
		dialect: z.union(["bash", "pwsh"]).required(),
		cwd: z.string(),
		timeoutMs: z.number().default(12e4),
		maxTimeoutMs: z.number().default(6e5),
		maxOutputBytes: z.number().default(64e3),
		maxSpillBytes: z.number().default(67108864),
		graceMs: z.number().default(3e3),
		executable: z.string()
	});
	config;
	manager;
	constructor(ctx, config) {
		super(ctx);
		this.config = config;
		this.manager = ctx.remoteSshManager;
		for (const name of [
			"timeoutMs",
			"maxTimeoutMs",
			"maxOutputBytes",
			"maxSpillBytes",
			"graceMs"
		]) {
			const value = this.config[name];
			if (!Number.isFinite(value) || value <= 0) throw new Error(`dsh-remote-ssh/shell-transparent: ${name} must be positive`);
		}
	}
	/** Remote and local routing is explicitly unconfined at the process layer. */
	get sandboxMode() {
		return "danger-full-access";
	}
	resolve(request) {
		const timeoutMs = Math.min(Math.floor(request.timeoutMs ?? this.config.timeoutMs), this.config.maxTimeoutMs);
		const stdoutMaxBytes = Math.floor(request.stdoutMaxBytes ?? this.config.maxOutputBytes);
		if (timeoutMs <= 0 || stdoutMaxBytes <= 0) throw new Error("dsh-remote-ssh/shell-transparent: timeout and output limits must be positive");
		return {
			command: request.command,
			workdir: request.workdir ?? this.config.cwd ?? process.cwd(),
			timeoutMs,
			onExpiry: request.onExpiry ?? "kill",
			stdoutMaxBytes,
			signal: request.signal,
			stdin: request.stdin,
			env: request.env,
			dshEnv: request.dshEnv,
			sandboxPolicy: request.sandboxPolicy
		};
	}
	async execute(spec) {
		assertUnconfined(spec);
		const route = this.manager.routeShell(spec.workdir, spec.dshEnv?.DSH_SESSION_ID);
		if (route.kind === "remote") {
			if (spec.signal?.aborted) throw spec.signal.reason ?? /* @__PURE__ */ new Error("shell aborted before preparation");
			const preparation = this.manager.workspaceShell(route, this.config.dialect).then((shell) => shell.execute(spec));
			let timer;
			let abortListener;
			let cause;
			let stop;
			const stopped = new Promise((resolve) => {
				stop = (reason) => {
					if (cause === void 0) {
						cause = reason;
						resolve(reason);
					}
				};
			});
			if (spec.onExpiry === "kill") timer = setTimeout(() => {
				stop("timeout");
			}, spec.timeoutMs);
			if (spec.signal !== void 0) {
				abortListener = () => {
					stop("abort");
				};
				spec.signal.addEventListener("abort", abortListener, { once: true });
			}
			try {
				const outcome = await Promise.race([preparation.then((execution) => ({
					kind: "ready",
					execution
				})), stopped.then((reason) => ({
					kind: "stop",
					reason
				}))]);
				if (outcome.kind === "stop") {
					preparation.then((execution) => {
						execution.kill();
					}).catch(() => {});
					if (outcome.reason === "abort") throw spec.signal?.reason ?? /* @__PURE__ */ new Error("shell aborted before publication");
					return expiredExecution(spec);
				}
				const execution = outcome.execution;
				execution.sandbox = {
					mode: "danger-full-access",
					denied: false
				};
				const result = execution.result.bind(execution);
				let projection;
				execution.result = () => projection ??= result().then((value) => ({
					...value,
					sandbox: {
						mode: "danger-full-access",
						denied: false
					}
				}));
				return execution;
			} finally {
				if (timer !== void 0) clearTimeout(timer);
				if (abortListener !== void 0) spec.signal?.removeEventListener("abort", abortListener);
			}
		}
		if (spec.signal?.aborted) throw spec.signal.reason ?? /* @__PURE__ */ new Error("shell aborted before preparation");
		const controller = new AbortController();
		let cause;
		const stop = (reason) => {
			if (cause !== void 0) return;
			cause = reason;
			controller.abort(reason === "abort" ? spec.signal?.reason : /* @__PURE__ */ new Error("shell timeout"));
		};
		const abort = () => {
			stop("abort");
		};
		spec.signal?.addEventListener("abort", abort, { once: true });
		const timer = spec.onExpiry === "kill" ? setTimeout(() => {
			stop("timeout");
		}, spec.timeoutMs) : void 0;
		try {
			const handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, spec.stdoutMaxBytes, controller.signal));
			const collected = requireCollected(handle);
			let stdoutOffset = 0;
			let stderrOffset = 0;
			let failure;
			let failureText = "";
			let finished = false;
			let resultPromise;
			const observed = {
				stdout: collected.stdout,
				stderr: { readFrom: (offset) => failureText ? {
					text: failureText.slice(offset),
					nextOffset: Buffer.byteLength(failureText),
					lossy: false
				} : collected.stderr.readFrom(offset) }
			};
			const execution = {
				status: "running",
				exitCode: null,
				signal: null,
				sandbox: {
					mode: "danger-full-access",
					denied: false
				},
				observed,
				done: handle.done.then((outcome) => {
					execution.exitCode = outcome.exitCode;
					execution.signal = outcome.signal;
					execution.status = outcome.signal === null ? "completed" : "killed";
				}, (error) => {
					failure = error;
					failureText = `spawn failed: ${String(error)}\n`;
					execution.status = "killed";
					execution.signal = "SIGTERM";
				}).finally(() => {
					finished = true;
					if (timer !== void 0) clearTimeout(timer);
					spec.signal?.removeEventListener("abort", abort);
				}),
				result: () => resultPromise ??= execution.done.then(() => {
					if (failure !== void 0) throw failure;
					return {
						exitCode: execution.exitCode,
						signal: execution.signal,
						timedOut: cause === "timeout",
						aborted: cause === "abort",
						timeoutMs: spec.timeoutMs,
						stdout: finalOutput(collected.stdout),
						stderr: finalOutput(collected.stderr),
						sandbox: {
							mode: "danger-full-access",
							denied: false
						}
					};
				}),
				readOutput: () => {
					const stdout = observed.stdout.readFrom(stdoutOffset);
					const stderr = observed.stderr.readFrom(stderrOffset);
					stdoutOffset = stdout.nextOffset;
					stderrOffset = stderr.nextOffset;
					return {
						delta: stdout.text + (stderr.text ? `${stdout.text && !stdout.text.endsWith("\n") ? "\n" : ""}[stderr]\n${stderr.text}` : ""),
						lossy: stdout.lossy || stderr.lossy,
						...stdout.spillPath === void 0 ? {} : { stdoutSpillPath: stdout.spillPath },
						...stderr.spillPath === void 0 ? {} : { stderrSpillPath: stderr.spillPath }
					};
				},
				kill: () => {
					if (finished || controller.signal.aborted) return false;
					controller.abort(/* @__PURE__ */ new Error("shell killed"));
					handle.terminate();
					return true;
				}
			};
			return execution;
		} catch (error) {
			if (timer !== void 0) clearTimeout(timer);
			spec.signal?.removeEventListener("abort", abort);
			throw error;
		}
	}
	spawnSpec(spec, stdoutMaxBytes, signal) {
		const collect = (maxBytes) => ({
			maxBytes,
			spill: { maxBytes: this.config.maxSpillBytes }
		});
		return {
			argv: this.argv(spec.command),
			cwd: spec.workdir,
			stdio: {
				stdin: spec.stdin === void 0 ? "ignore" : { data: spec.stdin },
				stdout: collect(stdoutMaxBytes),
				stderr: collect(this.config.maxOutputBytes)
			},
			graceMs: this.config.graceMs,
			signal,
			env: {
				NO_COLOR: "1",
				PAGER: "cat",
				GIT_PAGER: "cat",
				...spec.env,
				...spec.dshEnv
			}
		};
	}
	argv(command) {
		if (this.config.dialect === "bash") return [
			this.config.executable ?? "bash",
			"-c",
			command
		];
		return [
			this.config.executable ?? "pwsh",
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			PWSH_PREAMBLE + command
		];
	}
};
function expiredExecution(spec) {
	const empty = { readFrom: (_offset) => ({
		text: "",
		nextOffset: 0,
		lossy: false
	}) };
	const sandbox = {
		mode: "danger-full-access",
		denied: false
	};
	const result = {
		exitCode: null,
		signal: null,
		timedOut: true,
		aborted: false,
		timeoutMs: spec.timeoutMs,
		stdout: {
			text: "",
			truncated: false
		},
		stderr: {
			text: "",
			truncated: false
		},
		sandbox
	};
	const projected = Promise.resolve(result);
	return {
		status: "completed",
		exitCode: null,
		signal: null,
		sandbox,
		observed: {
			stdout: empty,
			stderr: empty
		},
		done: Promise.resolve(),
		result: () => projected,
		readOutput: () => ({
			delta: "",
			lossy: false
		}),
		kill: () => false
	};
}
function assertUnconfined(spec) {
	if (spec.sandboxPolicy !== void 0 && spec.sandboxPolicy.mode !== "danger-full-access") throw new Error(`dsh-remote-ssh: transparent shell cannot enforce ${spec.sandboxPolicy.mode} across SSH; select danger-full-access or confine the SSH account`);
}
function requireCollected(handle) {
	const { stdout, stderr } = handle.collected;
	if (stdout === void 0 || stderr === void 0) throw new Error("dsh-remote-ssh: subprocess dropped requested collected output");
	return {
		stdout,
		stderr
	};
}
function finalOutput(reader) {
	const value = reader.readFrom(0);
	return {
		text: value.text,
		truncated: value.lossy,
		...value.spillPath === void 0 ? {} : { spillPath: value.spillPath }
	};
}
//#endregion
export { TransparentShellExecutor, TransparentShellExecutor as default };
