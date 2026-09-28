import { resolve } from 'node:path'
import { ActionType, AhpErrorCodes } from '@microsoft/agent-host-protocol'
import type { AhpClient, Subscription, SubscriptionEvent } from '@microsoft/agent-host-protocol/client'
import { RpcError } from '@microsoft/agent-host-protocol/client'
import { Context } from '@deepseek-ai/cordis'
import { FsVersion } from '@deepseek-ai/dsh-fs'
import type { RemoteSshRuntime } from '../src/transport/runtime.ts'
import { WorkspacePathMapper } from '../src/transport/runtime.ts'
import RemoteSshFileSystem from '../src/transport/fs.ts'
import TransparentFileSystem from '../src/routing/fs.ts'
import { describe, expect, it } from 'vitest'

interface NodeEntry { type: 'file' | 'directory'; data: string | Uint8Array; etag: string }

class FakeSubscription implements AsyncIterableIterator<SubscriptionEvent> {
  private readonly events: SubscriptionEvent[] = []
  private waiter: (() => void) | undefined
  push(action: object): void {
    this.events.push({ type: 'action', params: { channel: 'ahp-terminal:/range', serverSeq: 1, action } } as SubscriptionEvent)
    this.waiter?.()
  }
  async next(): Promise<IteratorResult<SubscriptionEvent>> {
    if (this.events.length === 0) await new Promise<void>(resolve => { this.waiter = resolve })
    this.waiter = undefined
    return { value: this.events.shift()!, done: false }
  }
  async return(): Promise<IteratorResult<SubscriptionEvent>> { return { value: undefined, done: true } }
  [Symbol.asyncIterator](): this { return this }
  async close(): Promise<void> { this.waiter?.() }
}

class FakeAhp {
  readonly subscription = new FakeSubscription()
  readonly commands = new Map<string, string>()
  readonly terminalInputs: string[] = []
  readonly terminalRequests: string[] = []
  wholeFileReads = 0
  terminalExit = 0
  hangTerminal = false
  hangRangeWrite = false
  hangCleanup = false
  rangeWriteStarted: (() => void) | undefined
  readonly deletions: string[] = []
  readonly nodes = new Map<string, NodeEntry>([
    ['file:///srv', { type: 'directory', data: '', etag: 'd0' }],
    ['file:///srv/project', { type: 'directory', data: '', etag: 'd1' }],
    ['file:///srv/project/readme.txt', { type: 'file', data: 'hello\n', etag: 'v1' }],
    ['file:///srv/project-b', { type: 'directory', data: '', etag: 'd2' }],
  ])
  private version = 1

  async resourceResolve({ uri }: { uri: string }) {
    const node = this.nodes.get(uri)
    if (node === undefined) throw new RpcError(AhpErrorCodes.NotFound, 'missing')
    return { uri, type: node.type, size: Buffer.byteLength(node.data), etag: node.etag }
  }

  async resourceRead({ uri }: { uri: string }) {
    this.wholeFileReads++
    const node = this.nodes.get(uri)
    if (node === undefined) throw new RpcError(AhpErrorCodes.NotFound, 'missing')
    return { data: Buffer.from(node.data).toString('base64'), encoding: 'base64' }
  }

  async resourceWrite(params: { uri: string; data: string; encoding: string; createOnly?: boolean; ifMatch?: string }) {
    if (params.uri.includes('range-') && params.uri.endsWith('.sh')) {
      this.commands.set(params.uri, params.data)
      if (this.hangRangeWrite) {
        this.rangeWriteStarted?.()
        return new Promise<{}>(() => {})
      }
    }
    const old = this.nodes.get(params.uri)
    if (params.createOnly === true && old !== undefined) throw new RpcError(AhpErrorCodes.AlreadyExists, 'exists')
    if (params.ifMatch !== undefined && old?.etag !== params.ifMatch) throw new RpcError(AhpErrorCodes.Conflict, 'stale')
    const data = params.encoding === 'base64' ? Buffer.from(params.data, 'base64') : params.data
    this.nodes.set(params.uri, { type: 'file', data, etag: `v${++this.version}` })
    return {}
  }

  async resourceDelete({ uri }: { uri: string }) {
    this.deletions.push(uri)
    if (this.hangCleanup) return new Promise<{}>(() => {})
    return {}
  }

  async request(method: string) {
    this.terminalRequests.push(method)
    return {}
  }

  async subscribe() {
    return { result: {}, subscription: this.subscription as unknown as Subscription }
  }

  dispatch(_channel: string, action: { data: string }) {
    this.terminalInputs.push(action.data)
    if (this.hangTerminal) return { clientSeq: 1 }
    const command = [...this.commands.values()].at(-1) ?? ''
    const offset = Number(/skip=(\d+)/.exec(command)?.[1])
    const length = Number(/count=(\d+)/.exec(command)?.[1])
    const path = /if='((?:[^']|'"'"')*)'/.exec(command)?.[1]?.replaceAll(`'"'"'`, "'")
    const node = this.nodes.get(`file://${path?.split('/').map(encodeURIComponent).join('/')}`)
    const token = /DSH:([0-9a-f-]+):BEGIN/.exec(action.data)?.[1]
    if (token === undefined || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || node === undefined) throw new Error('invalid range command')
    const bytes = Buffer.from(node.data).subarray(offset, offset + length)
    this.subscription.push({ type: ActionType.TerminalData, data: `\x1eDSH:${token}:BEGIN\x1f${bytes.toString('base64')}\x1eDSH:${token}:END:${this.terminalExit}\x1f` })
    return { clientSeq: 1 }
  }

  async resourceList({ uri }: { uri: string }) {
    const prefix = `${uri}/`
    const entries = [...this.nodes].flatMap(([childUri, node]) => {
      if (!childUri.startsWith(prefix) || childUri.slice(prefix.length).includes('/')) return []
      return [{ name: decodeURIComponent(childUri.slice(prefix.length)), type: node.type, size: Buffer.byteLength(node.data) }]
    })
    return { entries }
  }
}

async function setup() {
  const ctx = new Context()
  const client = new FakeAhp()
  const local = resolve('tests', 'remote-alias')
  const runtime = {
    mapper: new WorkspacePathMapper(local, '/srv/project'),
    runtimeRoot: '/tmp/dsh-test',
    clientId: 'test-client',
    getClient: async () => client as unknown as AhpClient,
  } as unknown as RemoteSshRuntime
  ctx.provide('remoteSsh', runtime)
  await ctx.plugin(RemoteSshFileSystem, { diffBasisMaxBytes: 1024, maxReadBytes: 4096 })
  return { ctx, fs: ctx.fs as RemoteSshFileSystem, client, local }
}

describe('TransparentFileSystem', () => {
  it('delegates local windows and rejects removed remote workspace targets without local fallback', async () => {
    const { fs: remote, local } = await setup()
    const calls: string[] = []
    const localFs = { readByteRange: async () => { calls.push('local'); return Uint8Array.from([1]) } }
    const route = { kind: 'remote', workspace: { id: 'workspace-1' } }
    let removed = false
    const manager = {
      route: () => route,
      workspace: () => {
        if (removed) throw new Error('workspace removed')
        return route
      },
      workspaceContext: async () => ({ fs: remote }),
    }
    const ctx = new Context()
    ctx.provide('localFs', localFs as never)
    ctx.provide('remoteSshManager', manager as never)
    await ctx.plugin(TransparentFileSystem)
    const routed = ctx.fs
    const localTarget = { targetKey: 'file:///local', displayPath: '/local' } as never
    expect(await routed.readByteRange(localTarget, { offset: 0, length: 1 })).toEqual(Uint8Array.from([1]))
    const target = await routed.resolve('readme.txt', { cwd: local })
    removed = true
    await expect(routed.readByteRange(target, { offset: 0, length: 1 })).rejects.toThrow('workspace removed')
    expect(calls).toEqual(['local'])
    await ctx.fiber.dispose()
  })
})

describe('RemoteSshFileSystem', () => {
  it('reads bounded binary windows without AHP whole-file reads, including EOF and zero length', async () => {
    const { fs, client, local } = await setup()
    client.nodes.set("file:///srv/project/large'.bin", { type: 'file', data: Buffer.concat([Buffer.alloc(1_000_000), Buffer.from([0, 255, 42])]), etag: 'v2' })
    const target = await fs.resolve("large'.bin", { cwd: local })
    expect(await fs.readByteRange(target, { offset: 0, length: 2 })).toEqual(Buffer.from([0, 0]))
    expect(await fs.readByteRange(target, { offset: 1_000_000, length: 3 })).toEqual(Buffer.from([0, 255, 42]))
    expect(await fs.readByteRange(target, { offset: 1_000_002, length: 4 })).toEqual(Buffer.from([42]))
    expect(await fs.readByteRange(target, { offset: 1_000_010, length: 3 })).toEqual(Buffer.alloc(0))
    expect(await fs.readByteRange(target, { offset: 0, length: 0 })).toEqual(new Uint8Array())
    expect(client.wholeFileReads).toBe(0)
    expect([...client.commands.values()].join('\n')).toContain(`'"'"'`)
  })

  it('rejects invalid windows and aborts an in-flight terminal', async () => {
    const { fs, client, local } = await setup()
    const target = await fs.resolve('readme.txt', { cwd: local })
    for (const range of [{ offset: -1, length: 1 }, { offset: 0.5, length: 1 }, { offset: 0, length: -1 }, { offset: 0, length: 1.5 }, { offset: Number.MAX_SAFE_INTEGER, length: 2 }]) {
      await expect(fs.readByteRange(target, range)).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
    }
    expect(client.terminalInputs).toHaveLength(0)
    const controller = new AbortController()
    controller.abort()
    await expect(fs.readByteRange(target, { offset: 0, length: 1 }, controller.signal)).rejects.toMatchObject({ code: 'FS_ABORTED' })
    client.hangTerminal = true
    const during = new AbortController()
    const pending = fs.readByteRange(target, { offset: 0, length: 1 }, during.signal)
    await new Promise<void>(resolve => { const check = () => client.terminalInputs.length ? resolve() : setTimeout(check, 0); check() })
    during.abort()
    await expect(pending).rejects.toMatchObject({ code: 'FS_ABORTED' })
    expect(client.terminalRequests).toContain('disposeTerminal')
  })

  it('aborts promptly while a range write is stuck and does not wait for stuck cleanup', async () => {
    const { fs, client, local } = await setup()
    const target = await fs.resolve('readme.txt', { cwd: local })
    client.hangRangeWrite = true
    client.hangCleanup = true
    const started = new Promise<void>(resolve => { client.rangeWriteStarted = resolve })
    const controller = new AbortController()
    const pending = fs.readByteRange(target, { offset: 0, length: 1 }, controller.signal)
    await started
    controller.abort()
    await expect(Promise.race([
      pending.then(() => 'unexpected success', (error: unknown) => error),
      new Promise(resolve => setTimeout(() => resolve('still pending'), 250)),
    ])).resolves.toMatchObject({ code: 'FS_ABORTED' })
    expect(client.deletions).toHaveLength(1)
    expect(client.terminalRequests).not.toContain('createTerminal')
  })

  it('fails closed on terminal command errors', async () => {
    const { fs, client, local } = await setup()
    const target = await fs.resolve('readme.txt', { cwd: local })
    client.terminalExit = 127
    await expect(fs.readByteRange(target, { offset: 0, length: 1 })).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  })
  it('resolves through AHP while keeping the local alias out of display paths', async () => {
    const { ctx, fs, local } = await setup()
    const target = await fs.resolve('readme.txt', { cwd: local })
    expect(String(target.targetKey)).toBe('file:///srv/project/readme.txt')
    expect(target.displayPath).toBe('/srv/project/readme.txt')
    expect(target.displayPath).not.toContain(local)
    await expect(fs.readText(target)).resolves.toBe('hello\n')
  })

  it('creates, guarded-replaces, edits, and rejects a stale version', async () => {
    const { ctx, fs, local } = await setup()
    const target = await fs.resolve('new.txt', { cwd: local })
    const created = await fs.writeText(target, 'alpha\n', { kind: 'createIfAbsent' })
    expect(created.operation).toBe('create')
    const replaced = await fs.writeText(target, 'beta\n', { kind: 'replaceIfVersion', version: created.version })
    expect(replaced.operation).toBe('update')
    await expect(fs.writeText(target, 'stale', { kind: 'replaceIfVersion', version: FsVersion('stale') }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
    const edited = await fs.editText(target, { oldString: 'beta', newString: 'gamma', replaceAll: false }, { version: replaced.version })
    expect(edited.after).toBe('gamma\n')
    await expect(fs.readText(target)).resolves.toBe('gamma\n')
  })

  it('publishes exact binary bytes through AHP base64 transport', async () => {
    const { fs, client, local } = await setup()
    const content = Uint8Array.from([0x00, 0xff, 0x42])
    const target = await fs.resolve('asset.bin', { cwd: local })
    const outcome = await fs.writeBytes(target, content, { kind: 'createIfAbsent' })

    expect(outcome).toMatchObject({ operation: 'create', bytes: content.byteLength })
    expect(client.nodes.get('file:///srv/project/asset.bin')?.data).toEqual(Buffer.from(content))
  })

  it('enforces read-only mutation policy before issuing AHP writes', async () => {
    const { ctx, fs, client, local } = await setup()
    const target = await fs.resolve('readme.txt', { cwd: local })
    await expect(fs.writeText(target, 'blocked', undefined, undefined, {
      mode: 'read-only', workspaceRoot: local,
    })).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    await expect(fs.writeBytes(target, Uint8Array.from([0xff]), undefined, undefined, {
      mode: 'read-only', workspaceRoot: local,
    })).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    expect(client.nodes.get('file:///srv/project/readme.txt')?.data).toBe('hello\n')
  })

  it('allows cross-workspace writes only under danger-full-access', async () => {
    const { ctx, fs, local } = await setup()
    const allowed = await fs.resolve('/srv/project-b/full-access.txt', { cwd: local })
    await expect(fs.writeText(allowed, 'shared host\n', { kind: 'createIfAbsent' }, undefined, {
      mode: 'danger-full-access', workspaceRoot: local,
    })).resolves.toMatchObject({ operation: 'create' })

    const denied = await fs.resolve('/srv/project-b/workspace-write.txt', { cwd: local })
    await expect(fs.writeText(denied, 'blocked\n', { kind: 'createIfAbsent' }, undefined, {
      mode: 'workspace-write', workspaceRoot: local,
    })).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    await ctx.fiber.dispose()
  })
})
