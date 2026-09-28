import { Context } from '@deepseek-ai/cordis'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type {
  CollectedOutput,
  ShellExecRequest,
  ShellExecSpec,
  ShellExecution,
  ShellProcessRead,
  ShellRunResult,
} from '@deepseek-ai/dsh-shell'
import type { SubprocessHandle, SubprocessOutputReader, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import z from '@deepseek-ai/schemastery'
import type { RemoteSshManager } from './manager.ts'

export interface Config {
  dialect: 'bash' | 'pwsh'
  cwd?: string
  timeoutMs?: number
  maxTimeoutMs?: number
  maxOutputBytes?: number
  maxSpillBytes?: number
  graceMs?: number
  executable?: string
}

interface ResolvedConfig extends Config {
  timeoutMs: number
  maxTimeoutMs: number
  maxOutputBytes: number
  maxSpillBytes: number
  graceMs: number
}

const PWSH_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); '

/** Syntax-specific shell provider over the cwd-routed subprocess service. */
export class TransparentShellExecutor extends ShellExecutor {
  static inject = ['subprocess', 'remoteSshManager']
  static Config: z<Config> = z.object({
    dialect: z.union(['bash', 'pwsh'] as const).required(),
    cwd: z.string(),
    timeoutMs: z.number().default(120_000),
    maxTimeoutMs: z.number().default(600_000),
    maxOutputBytes: z.number().default(64_000),
    maxSpillBytes: z.number().default(64 * 1024 * 1024),
    graceMs: z.number().default(3_000),
    executable: z.string(),
  })

  private readonly config: ResolvedConfig
  private readonly manager: RemoteSshManager

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = config as ResolvedConfig
    this.manager = ctx.remoteSshManager
    for (const name of ['timeoutMs', 'maxTimeoutMs', 'maxOutputBytes', 'maxSpillBytes', 'graceMs'] as const) {
      const value = this.config[name]
      if (!Number.isFinite(value) || value <= 0) throw new Error(`dsh-remote-ssh/shell-transparent: ${name} must be positive`)
    }
  }

  /** Remote and local routing is explicitly unconfined at the process layer. */
  override get sandboxMode(): 'danger-full-access' {
    return 'danger-full-access'
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    const timeoutMs = Math.min(Math.floor(request.timeoutMs ?? this.config.timeoutMs), this.config.maxTimeoutMs)
    const stdoutMaxBytes = Math.floor(request.stdoutMaxBytes ?? this.config.maxOutputBytes)
    if (timeoutMs <= 0 || stdoutMaxBytes <= 0) throw new Error('dsh-remote-ssh/shell-transparent: timeout and output limits must be positive')
    return {
      command: request.command,
      workdir: request.workdir ?? this.config.cwd ?? process.cwd(),
      timeoutMs,
      onExpiry: request.onExpiry ?? 'kill',
      stdoutMaxBytes,
      signal: request.signal,
      stdin: request.stdin,
      env: request.env,
      dshEnv: request.dshEnv,
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  override async execute(spec: ShellExecSpec): Promise<ShellExecution> {
    assertUnconfined(spec)
    const route = this.manager.routeShell(spec.workdir, spec.dshEnv?.DSH_SESSION_ID)
    if (route.kind === 'remote') {
      if (spec.signal?.aborted) throw spec.signal.reason ?? new Error('shell aborted before preparation')
      const preparation = this.manager.workspaceShell(route, this.config.dialect).then(shell => shell.execute(spec))
      let timer: ReturnType<typeof setTimeout> | undefined
      let abortListener: (() => void) | undefined
      let cause: 'timeout' | 'abort' | undefined
      let stop!: (cause: 'timeout' | 'abort') => void
      const stopped = new Promise<'timeout' | 'abort'>(resolve => { stop = reason => { if (cause === undefined) { cause = reason; resolve(reason) } } })
      if (spec.onExpiry === 'kill') timer = setTimeout(() => { stop('timeout') }, spec.timeoutMs)
      if (spec.signal !== undefined) {
        abortListener = () => { stop('abort') }
        spec.signal.addEventListener('abort', abortListener, { once: true })
      }
      try {
        const outcome = await Promise.race([
          preparation.then(execution => ({ kind: 'ready' as const, execution })),
          stopped.then(reason => ({ kind: 'stop' as const, reason })),
        ])
        if (outcome.kind === 'stop') {
          void preparation.then(execution => { execution.kill() }).catch(() => {})
          if (outcome.reason === 'abort') throw spec.signal?.reason ?? new Error('shell aborted before publication')
          return expiredExecution(spec)
        }
        const execution = outcome.execution
        execution.sandbox = { mode: 'danger-full-access', denied: false }
        const result = execution.result.bind(execution)
        let projection: Promise<ShellRunResult> | undefined
        execution.result = () => projection ??= result().then(value => ({ ...value, sandbox: { mode: 'danger-full-access', denied: false } }))
        return execution
      } finally {
        if (timer !== undefined) clearTimeout(timer)
        if (abortListener !== undefined) spec.signal?.removeEventListener('abort', abortListener)
      }
    }
    if (spec.signal?.aborted) throw spec.signal.reason ?? new Error('shell aborted before preparation')
    const controller = new AbortController()
    let cause: 'timeout' | 'abort' | undefined
    const stop = (reason: 'timeout' | 'abort'): void => {
      if (cause !== undefined) return
      cause = reason
      controller.abort(reason === 'abort' ? spec.signal?.reason : new Error('shell timeout'))
    }
    const abort = (): void => { stop('abort') }
    spec.signal?.addEventListener('abort', abort, { once: true })
    const timer = spec.onExpiry === 'kill' ? setTimeout(() => { stop('timeout') }, spec.timeoutMs) : undefined
    try {
      const handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, spec.stdoutMaxBytes, controller.signal))
      const collected = requireCollected(handle)
      let stdoutOffset = 0
      let stderrOffset = 0
      let failure: unknown
      let failureText = ''
      let finished = false
      let resultPromise: Promise<ShellRunResult> | undefined
      const observed = {
        stdout: collected.stdout,
        stderr: { readFrom: (offset: number) => failureText ? { text: failureText.slice(offset), nextOffset: Buffer.byteLength(failureText), lossy: false } : collected.stderr.readFrom(offset) },
      }
      const execution: ShellExecution = {
        status: 'running', exitCode: null, signal: null,
        sandbox: { mode: 'danger-full-access', denied: false }, observed,
        done: handle.done.then(outcome => {
          execution.exitCode = outcome.exitCode
          execution.signal = outcome.signal
          execution.status = outcome.signal === null ? 'completed' : 'killed'
        }, (error: unknown) => {
          failure = error
          failureText = `spawn failed: ${String(error)}\n`
          execution.status = 'killed'
          execution.signal = 'SIGTERM'
        }).finally(() => { finished = true; if (timer !== undefined) clearTimeout(timer); spec.signal?.removeEventListener('abort', abort) }),
        result: () => resultPromise ??= execution.done.then(() => {
          if (failure !== undefined) throw failure
          return {
            exitCode: execution.exitCode, signal: execution.signal,
            timedOut: cause === 'timeout', aborted: cause === 'abort', timeoutMs: spec.timeoutMs,
            stdout: finalOutput(collected.stdout), stderr: finalOutput(collected.stderr),
            sandbox: { mode: 'danger-full-access', denied: false },
          }
        }),
        readOutput: (): ShellProcessRead => {
          const stdout = observed.stdout.readFrom(stdoutOffset)
          const stderr = observed.stderr.readFrom(stderrOffset)
          stdoutOffset = stdout.nextOffset
          stderrOffset = stderr.nextOffset
          return {
            delta: stdout.text + (stderr.text ? `${stdout.text && !stdout.text.endsWith('\n') ? '\n' : ''}[stderr]\n${stderr.text}` : ''),
            lossy: stdout.lossy || stderr.lossy,
            ...(stdout.spillPath === undefined ? {} : { stdoutSpillPath: stdout.spillPath }),
            ...(stderr.spillPath === undefined ? {} : { stderrSpillPath: stderr.spillPath }),
          }
        },
        kill: () => {
          if (finished || controller.signal.aborted) return false
          controller.abort(new Error('shell killed'))
          handle.terminate()
          return true
        },
      }
      return execution
    } catch (error) {
      if (timer !== undefined) clearTimeout(timer)
      spec.signal?.removeEventListener('abort', abort)
      throw error
    }
  }

  private spawnSpec(spec: ShellExecSpec, stdoutMaxBytes: number, signal: AbortSignal | undefined): SubprocessSpawnSpec {
    const collect = (maxBytes: number) => ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes } })
    return {
      argv: this.argv(spec.command),
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin === undefined ? 'ignore' : { data: spec.stdin },
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes),
      },
      graceMs: this.config.graceMs,
      signal,
      env: { NO_COLOR: '1', PAGER: 'cat', GIT_PAGER: 'cat', ...spec.env, ...spec.dshEnv },
    }
  }

  private argv(command: string): string[] {
    if (this.config.dialect === 'bash') return [this.config.executable ?? 'bash', '-c', command]
    return [this.config.executable ?? 'pwsh', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PWSH_PREAMBLE + command]
  }
}

function expiredExecution(spec: ShellExecSpec): ShellExecution {
  const empty = { readFrom: (_offset: number) => ({ text: '', nextOffset: 0, lossy: false }) }
  const sandbox = { mode: 'danger-full-access' as const, denied: false }
  const result: ShellRunResult = {
    exitCode: null, signal: null, timedOut: true, aborted: false, timeoutMs: spec.timeoutMs,
    stdout: { text: '', truncated: false }, stderr: { text: '', truncated: false }, sandbox,
  }
  const projected = Promise.resolve(result)
  return {
    status: 'completed', exitCode: null, signal: null, sandbox,
    observed: { stdout: empty, stderr: empty }, done: Promise.resolve(),
    result: () => projected,
    readOutput: () => ({ delta: '', lossy: false }), kill: () => false,
  }
}

function assertUnconfined(spec: ShellExecSpec): void {
  if (spec.sandboxPolicy !== undefined && spec.sandboxPolicy.mode !== 'danger-full-access') {
    throw new Error(`dsh-remote-ssh: transparent shell cannot enforce ${spec.sandboxPolicy.mode} across SSH; select danger-full-access or confine the SSH account`)
  }
}

function requireCollected(handle: SubprocessHandle): { stdout: SubprocessOutputReader; stderr: SubprocessOutputReader } {
  const { stdout, stderr } = handle.collected
  if (stdout === undefined || stderr === undefined) throw new Error('dsh-remote-ssh: subprocess dropped requested collected output')
  return { stdout, stderr }
}

function finalOutput(reader: SubprocessOutputReader): CollectedOutput {
  const value = reader.readFrom(0)
  return {
    text: value.text,
    truncated: value.lossy,
    ...(value.spillPath === undefined ? {} : { spillPath: value.spillPath }),
  }
}

export default TransparentShellExecutor
