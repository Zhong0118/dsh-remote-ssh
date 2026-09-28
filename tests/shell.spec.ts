import { resolve } from 'node:path'
import { ActionType } from '@microsoft/agent-host-protocol'
import type { AhpClient, Subscription, SubscriptionEvent } from '@microsoft/agent-host-protocol/client'
import { Context } from '@deepseek-ai/cordis'
import type { RemoteSshRuntime } from '../src/transport/runtime.ts'
import { WorkspacePathMapper } from '../src/transport/runtime.ts'
import RemoteSshShellExecutor from '../src/transport/shell.ts'
import TransparentShellExecutor from '../src/routing/shell.ts'
import { describe, expect, it } from 'vitest'

class FakeSubscription implements AsyncIterableIterator<SubscriptionEvent> {
  private readonly events: SubscriptionEvent[] = []
  push(action: object): void {
    this.events.push({ type: 'action', params: { channel: 'ahp-terminal:/test', serverSeq: this.events.length + 1, action } } as SubscriptionEvent)
  }
  async next(): Promise<IteratorResult<SubscriptionEvent>> {
    while (this.events.length === 0) await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
    return { value: this.events.shift()!, done: false }
  }
  async return(): Promise<IteratorResult<SubscriptionEvent>> { return { value: undefined, done: true } }
  [Symbol.asyncIterator](): this { return this }
  async close(): Promise<void> {}
}

class FakeTerminalAhp {
  readonly subscription = new FakeSubscription()
  readonly writes: string[] = []
  readonly deletes: string[] = []
  disposed = false
  autoComplete = true
  lastToken = ''

  async resourceWrite({ uri }: { uri: string }): Promise<void> { this.writes.push(uri) }
  async resourceDelete({ uri }: { uri: string }) { this.deletes.push(uri); return {} }
  async request(method: string) {
    if (method === 'disposeTerminal') this.disposed = true
    return {}
  }
  async subscribe() {
    return { result: { snapshot: { resource: 'ahp-terminal:/test', state: {} } }, subscription: this.subscription as unknown as Subscription }
  }
  dispatch(_channel: string, action: { data: string }) {
    const token = /DSH:([0-9a-f-]+):BEGIN/.exec(action.data)?.[1]
    if (token === undefined) throw new Error('missing output marker')
    this.lastToken = token
    if (!this.autoComplete) return { clientSeq: 1 }
    this.subscription.push({ type: ActionType.TerminalData, data: `echoed input\r\n\x1eDSH:${token}:BE` })
    this.subscription.push({ type: ActionType.TerminalData, data: `GIN\x1fremote-output\r\n\x1eDSH:${token}:END:` })
    this.subscription.push({ type: ActionType.TerminalData, data: '7\x1ftrailing prompt' })
    this.subscription.push({ type: ActionType.TerminalExited, exitCode: 7 })
    return { clientSeq: 1 }
  }
}

async function setup() {
  const ctx = new Context()
  const client = new FakeTerminalAhp()
  const local = resolve('tests', 'shell-alias')
  const runtime = {
    mapper: new WorkspacePathMapper(local, '/srv/project'),
    runtimeRoot: '/tmp/dsh/test',
    clientId: 'test-client',
    getClient: async () => client as unknown as AhpClient,
  } as unknown as RemoteSshRuntime
  ctx.provide('remoteSsh', runtime)
  await ctx.plugin(RemoteSshShellExecutor, {
    defaultTimeoutMs: 1000,
    maxTimeoutMs: 2000,
    outputMaxBytes: 1024,
    maxOutputMaxBytes: 4096,
    shellCommand: 'bash',
  })
  return { ctx, client, local }
}

describe('TransparentShellExecutor local execution', () => {
  it('times out remote shell preparation before workspace connection resolves', async () => {
    const ctx = new Context()
    ctx.provide('remoteSshManager', {
      routeShell: () => ({ kind: 'remote' }),
      workspaceShell: async () => new Promise<never>(() => {}),
    } as never)
    ctx.provide('subprocess', {} as never)
    await ctx.plugin(TransparentShellExecutor, { dialect: 'bash', timeoutMs: 1000, maxTimeoutMs: 2000, maxOutputBytes: 1024, maxSpillBytes: 1024, graceMs: 100 })
    const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'true', timeoutMs: 5 }))
    await expect(execution.done).resolves.toBeUndefined()
    expect(await execution.result()).toMatchObject({ timedOut: true, aborted: false, exitCode: null, sandbox: { mode: 'danger-full-access' } })
  })
  it('keeps provider failure on stderr while done resolves and result rejects', async () => {
    const ctx = new Context()
    ctx.provide('remoteSshManager', { routeShell: () => ({ kind: 'local' }) } as never)
    ctx.provide('subprocess', { spawn: () => ({
      collected: {
        stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
        stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
      },
      done: Promise.reject(new Error('local spawn denied')), terminate: () => {},
    }) } as never)
    await ctx.plugin(TransparentShellExecutor, { dialect: 'bash', timeoutMs: 1000, maxTimeoutMs: 2000, maxOutputBytes: 1024, maxSpillBytes: 1024, graceMs: 100 })
    const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'true' }))
    await expect(execution.done).resolves.toBeUndefined()
    expect(execution.observed.stderr.readFrom(0).text).toContain('spawn failed:')
    await expect(execution.result()).rejects.toThrow('local spawn denied')
  })

  it('publishes independent collected readers and memoized foreground result', async () => {
    const ctx = new Context()
    const local = resolve('tests')
    const output = { readFrom: (offset: number) => ({ text: 'hello'.slice(offset), nextOffset: 5, lossy: false }) }
    const errors = { readFrom: (offset: number) => ({ text: 'warning'.slice(offset), nextOffset: 7, lossy: false }) }
    ctx.provide('remoteSshManager', { routeShell: () => ({ kind: 'local' }) } as never)
    ctx.provide('subprocess', { spawn: () => ({ collected: { stdout: output, stderr: errors }, done: Promise.resolve({ exitCode: 2, signal: null }), terminate: () => {} }) } as never)
    await ctx.plugin(TransparentShellExecutor, { dialect: 'bash', timeoutMs: 1000, maxTimeoutMs: 2000, maxOutputBytes: 1024, maxSpillBytes: 1024, graceMs: 100 })
    const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'false', workdir: local }))
    await execution.done
    expect(execution.observed.stdout.readFrom(0).text).toBe('hello')
    expect(execution.readOutput().delta).toContain('[stderr]\nwarning')
    expect(execution.readOutput().delta).toBe('')
    expect(execution.observed.stdout.readFrom(0).text).toBe('hello')
    expect(execution.result()).toBe(execution.result())
    expect(await execution.result()).toMatchObject({ exitCode: 2, stdout: { text: 'hello' }, stderr: { text: 'warning' }, sandbox: { mode: 'danger-full-access', denied: false } })
  })
})

describe('RemoteSshShellExecutor', () => {
  it('settles timeout despite stuck AHP cleanup and retries deletion after a late command write', async () => {
    const { ctx, client, local } = await setup()
    let finishWrite!: () => void
    const pendingWrite = new Promise<void>(resolveWrite => { finishWrite = resolveWrite })
    let writeStarted!: () => void
    const started = new Promise<void>(resolveStarted => { writeStarted = resolveStarted })
    client.resourceWrite = async ({ uri }: { uri: string }) => { client.writes.push(uri); writeStarted(); await pendingWrite }
    client.resourceDelete = async ({ uri }: { uri: string }) => {
      client.deletes.push(uri)
      if (client.deletes.length === 1) await new Promise<void>(() => {})
      return {}
    }
    const executionPromise = ctx.shell.execute(ctx.shell.resolve({ command: 'true', workdir: local, timeoutMs: 10 }))
    await started
    const execution = await executionPromise
    await execution.done
    expect(await execution.result()).toMatchObject({ timedOut: true, exitCode: null })
    finishWrite()
    await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
    expect(client.deletes.filter(uri => uri === client.writes[0])).toHaveLength(2)
  })

  it('projects AHP terminal command actions into a ShellRunResult', async () => {
    const { ctx, client, local } = await setup()
    const execution = await ctx.shell.execute(ctx.shell.resolve({
      command: 'printf remote-output',
      workdir: local,
      sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: local },
    }))
    const result = await execution.result()
    expect(execution.observed.stdout.readFrom(0).text).toBe('remote-output\r\n')
    expect(execution.readOutput().delta).toBe('remote-output\r\n')
    expect(execution.readOutput().delta).toBe('')
    expect(result).toMatchObject({ exitCode: 7, signal: null, timedOut: false, aborted: false })
    expect(result.stdout).toEqual({ text: 'remote-output\r\n', truncated: false })
    expect(result.stderr).toEqual({ text: '', truncated: false })
    expect(client.writes).toHaveLength(1)
    expect(client.disposed).toBe(true)
  })

  it('publishes a live handle with independent observed byte offsets', async () => {
    const { ctx, client, local } = await setup()
    client.autoComplete = false
    const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'sleep 1', workdir: local, onExpiry: 'none', timeoutMs: 1 }))
    client.subscription.push({ type: ActionType.TerminalData, data: `\x1eDSH:${client.lastToken}:BEGIN\x1fhello plus enough data for marker holdback ${'x'.repeat(90)}` })
    await new Promise(resolvePromise => setTimeout(resolvePromise, 5))
    const first = execution.observed.stdout.readFrom(0)
    expect(first.text).toContain('hello')
    expect(execution.observed.stdout.readFrom(0).text).toBe(first.text)
    expect(execution.readOutput().delta).toBe(first.text)
    expect(execution.readOutput().delta).toBe('')
    expect(execution.status).toBe('running')
    client.subscription.push({ type: ActionType.TerminalData, data: ` world\x1eDSH:${client.lastToken}:END:0\x1f` })
    await execution.done
    expect(execution.observed.stdout.readFrom(first.nextOffset).text).toContain(' world')
    expect(await execution.result()).toMatchObject({ exitCode: 0, timedOut: false, aborted: false })
  })

  it('publishes a settled timed-out handle if preparation exceeds its deadline', async () => {
    const { ctx, local } = await setup()
    const runtime = (ctx as unknown as { remoteSsh: RemoteSshRuntime }).remoteSsh
    runtime.getClient = async () => new Promise<AhpClient>(() => {})
    const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'sleep 1', workdir: local, timeoutMs: 5 }))
    await execution.done
    expect(execution.status).toBe('completed')
    expect(await execution.result()).toMatchObject({ exitCode: null, signal: null, timedOut: true, aborted: false })
  })

  it('rejects pre-publication abort and retains first timeout cause after later abort', async () => {
    const { ctx, client, local } = await setup()
    const aborted = new AbortController()
    aborted.abort(new Error('preparation cancelled'))
    await expect(ctx.shell.execute(ctx.shell.resolve({ command: 'true', workdir: local, signal: aborted.signal }))).rejects.toThrow('preparation cancelled')
    expect(client.writes).toHaveLength(0)
    client.autoComplete = false
    const later = new AbortController()
    const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'sleep', workdir: local, timeoutMs: 5, signal: later.signal }))
    await execution.done
    later.abort()
    expect(await execution.result()).toMatchObject({ timedOut: true, aborted: false })
    expect(client.disposed).toBe(true)
  })

  it('rejects infrastructure failure through result while done remains nonrejecting', async () => {
    const { ctx, local } = await setup()
    const runtime = (ctx as unknown as { remoteSsh: RemoteSshRuntime }).remoteSsh
    runtime.getClient = async () => { throw new Error('AHP offline') }
    await expect(ctx.shell.execute(ctx.shell.resolve({ command: 'true', workdir: local }))).rejects.toThrow('AHP offline')
    const { ctx: active, client, local: activeLocal } = await setup()
    client.autoComplete = false
    const execution = await active.shell.execute(active.shell.resolve({ command: 'true', workdir: activeLocal }))
    client.subscription.push({ type: ActionType.TerminalExited, exitCode: 1 })
    await expect(execution.done).resolves.toBeUndefined()
    expect(execution.status).toBe('killed')
    expect(execution.observed.stderr.readFrom(0).text).toContain('spawn failed:')
    await expect(execution.result()).rejects.toThrow('terminal exited before the output marker')
  })

  it('rejects restrictive modes rather than pretending a remote shell is confined', async () => {
    const { ctx, local } = await setup()
    await expect(ctx.shell.execute(ctx.shell.resolve({
      command: 'true',
      workdir: local,
      sandboxPolicy: { mode: 'workspace-write', workspaceRoot: local },
    }))).rejects.toThrow(/cannot confine arbitrary remote commands/)
  })
})
