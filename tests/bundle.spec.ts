import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const BASE_ROWS: EntryOptions[] = [
  { id: 'subprocess', name: '@deepseek-ai/dsh-subprocess-local' },
  { id: 'fs-sandbox', name: '@deepseek-ai/dsh-fs-sandbox' },
  { id: 'bash-sandbox', name: '@deepseek-ai/dsh-bash-sandbox', disabled: true },
  { id: 'pwsh-sandbox', name: '@deepseek-ai/dsh-pwsh-sandbox', disabled: false },
  { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: true },
  { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: false },
  { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', disabled: true },
  { id: 'agent-preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry' },
  { id: 'spill-local', name: '@deepseek-ai/dsh-spill-local' },
  { id: 'directory-picker', name: '@deepseek-ai/dsh-host-directory-picker-auto' },
  { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy', config: {} },
  { id: 'approval', name: '@deepseek-ai/dsh-user-approval', config: {} },
  { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: {} },
]

describe('bundle overlay', () => {
  it('moves local providers behind cwd routers without adding remote tool names', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'cordis.patch.yml'), 'utf8')
    const patches = load(source, { schema: entryListSchema }) as PatchOptions[]
    const warnings: string[] = []
    const rows = applyEntryPatches(BASE_ROWS, patches, (message, ...args) => {
      warnings.push([message, ...args].join(' '))
    })
    const byId = new Map(rows.map(row => [row.id, row]))

    expect(warnings).toEqual([])
    expect(byId.get('subprocess')).toMatchObject({ name: '@deepseek-ai/dsh-subprocess-local', disabled: true })
    expect(byId.get('fs-sandbox')).toMatchObject({ name: '@deepseek-ai/dsh-fs-sandbox', disabled: true })
    expect(byId.get('bash-sandbox')).toMatchObject({ name: '@deepseek-ai/dsh-bash-sandbox', disabled: true })
    expect(byId.get('tool-fs-search')).toMatchObject({ name: '@deepseek-ai/dsh-tool-fs-search', disabled: true })
    expect(byId.get('spill-local')).toMatchObject({ name: '@deepseek-ai/dsh-spill-local', disabled: true })
    expect(byId.get('remote-ssh-manager')).toMatchObject({ name: 'dsh-remote-ssh/manager' })
    expect(byId.get('remote-ssh-client-host')).toMatchObject({ name: 'dsh-remote-ssh' })
    expect(byId.get('remote-ssh-web')).toMatchObject({
      name: 'dsh-remote-ssh/web',
      inject: ['remoteSshManager'],
    })
    expect(byId.get('directory-picker')).toMatchObject({ disabled: true })
    expect(byId.get('remote-ssh-directory-browser')).toMatchObject({ name: '@deepseek-ai/dsh-host-directory-picker-browse' })
    expect(byId.get('remote-ssh-fs-router')).toMatchObject({ name: 'dsh-remote-ssh/router-fs' })
    expect(byId.get('remote-ssh-subprocess-router')).toMatchObject({ name: 'dsh-remote-ssh/router-subprocess' })
    expect(byId.get('remote-ssh-spill-router')).toMatchObject({ name: 'dsh-remote-ssh/spill' })
    expect(byId.get('remote-ssh-search')).toMatchObject({ name: 'dsh-remote-ssh/search' })
    expect(byId.has('remote-ssh-tool-fs-search')).toBe(false)
    expect(byId.get('agent-preset-registry')).toMatchObject({
      name: '@deepseek-ai/dsh-agent-preset-registry',
      inject: ['loader', 'sessionProjections', 'remoteSshSearchHook'],
    })
    expect(byId.get('remote-ssh-shell-default')).toMatchObject({ name: 'dsh-remote-ssh/shell-transparent' })
    expect(byId.get('remote-ssh-bash')).toMatchObject({ name: 'cordis:group' })
    expect(byId.get('remote-ssh-pwsh')).toMatchObject({ name: 'cordis:group' })
    expect(byId.get('remote-ssh-agent-policy')).toMatchObject({ name: 'dsh-remote-ssh/agent-policy' })
    expect(byId.has('remote-ssh-tui')).toBe(false)
    expect(byId.has('remote-ssh-tui-backend')).toBe(false)
    expect(byId.get('remote-ssh-search')).toMatchObject({
      inject: ['remoteSshManager'],
    })
    expect(byId.get('remote-ssh-search')?.inject).not.toContain('loader')
    const localWorld = byId.get('remote-ssh-local-world')
    expect(localWorld).toMatchObject({ name: 'cordis:group' })
    const localChildren = Array.isArray(localWorld?.config) ? localWorld.config as EntryOptions[] : []
    expect(localChildren.find(row => row.id === 'local-spill')).toMatchObject({ name: '@deepseek-ai/dsh-spill-local' })
    const shellChildren = [byId.get('remote-ssh-bash'), byId.get('remote-ssh-pwsh')]
      .flatMap(row => Array.isArray(row?.config) ? row.config as EntryOptions[] : [])
    expect(shellChildren.map(row => row.id)).toEqual([
      'remote-ssh-bash-shell',
      'remote-ssh-bash-tool',
      'remote-ssh-pwsh-executor',
      'remote-ssh-pwsh-tool',
    ])
    expect(shellChildren.find(row => row.id === 'remote-ssh-bash-tool')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-bash',
    })
    expect(source).not.toContain('dsh-tool-bash-persistent')
    expect(new Set(shellChildren.map(row => row.id)).size).toBe(shellChildren.length)
    expect(rows.some(row => String(row.name).includes('remote-tool'))).toBe(false)
  })

  it('uses the current Plugins settings tab slot', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'client', 'index.tsx'), 'utf8')
    expect(source).toContain("ctx.slots.inject('settings.plugins.tab'")
    expect(source).not.toContain("settings.plugin.item")
  })

  it('declares Client Remote inject so ctx.remote.session is legal', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'client', 'index.tsx'), 'utf8')
    expect(source).toMatch(/inject = \[[^\]]*'remote'[^\]]*\]/)
    expect(source).toContain("'remote.session'")
  })
})
