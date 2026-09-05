import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  CONFIG_HOST_PATH, DIRECTORY_PATH, emptyCatalog, PROBE_PATH, request, STATE_PATH,
  WORKSPACE_PATH, WORKSPACE_REMOVE_PATH,
} from './api.ts'
import type { CatalogState, RemoteDirectoryListing } from './api.ts'
import { button, card, dim, input, page, primary, row, singleLineInput } from './styles.ts'
import { requireTranslate } from './types.ts'
import type { LocalizedProps } from './types.ts'
import { WorkspaceDirectoryPicker } from './WorkspaceDirectoryPicker.tsx'

/** Full Remote SSH settings page. */
export function RemoteSshSettings({ t: optionalT }: LocalizedProps): ReactElement {
  const t = requireTranslate(optionalT, 'Remote SSH settings')
  const [state, setState] = useState<CatalogState>(emptyCatalog)
  const [serverId, setServerId] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false)
  const [showAddHost, setShowAddHost] = useState(false)
  const [hostCommand, setHostCommand] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    const next = await request<CatalogState>(STATE_PATH)
    setState(next)
    setServerId(current => next.servers.some(server => server.id === current) ? current : next.servers[0]?.id ?? '')
    setConfigPath(current => next.configFiles.includes(current) ? current : next.configFiles[0] ?? '')
  }, [])
  useEffect(() => { void refresh().catch(error => { setMessage(String(error)) }) }, [refresh])

  const addHost = async (): Promise<void> => {
    await request(CONFIG_HOST_PATH, 'POST', { command: hostCommand, configPath })
    setHostCommand('')
    setShowAddHost(false)
    setMessage(t('hostAdded'))
    await refresh()
  }
  const addWorkspace = async (): Promise<void> => {
    await request(WORKSPACE_PATH, 'POST', { serverId, remotePath })
    setRemotePath('')
    await refresh()
  }
  const probe = async (id: string): Promise<void> => {
    const result = await request<{ reachable: boolean; hostname?: string; commands?: Record<string, boolean>; error?: string }>(PROBE_PATH, 'POST', { id })
    const commands = Object.entries(result.commands ?? {}).map(([name, yes]) => `${name} ${yes ? '✓' : '×'}`).join(', ')
    setMessage(result.reachable
      ? t('probeSuccess', { hostname: result.hostname ?? id, commands })
      : t('probeFailure', { error: result.error ?? t('unknownError') }))
  }

  return <section style={page}>
    <div>
      <h2 style={{ margin: 0, fontSize: 20 }}>{t('title')}</h2>
      <p style={{ ...dim, marginTop: 6 }}>{t('summary', { servers: state.discoveredServerCount, workspaces: state.workspaceCount })}</p>
    </div>
    {message ? <p role="status" style={dim}>{message}</p> : null}

    <div style={card}>
      <strong>{t('servers')}</strong>
      {state.servers.map(server => <div key={server.id} style={row}>
        <span style={{ flex: 1 }}>
          <b>{server.label}</b>
          {server.hostName ? <span> · {server.user ? `${server.user}@` : ''}{server.hostName}{server.port ? `:${server.port}` : ''}</span> : null}
          <small style={{ display: 'block', color: 'var(--dsw-alias-label-secondary)' }}>{server.configPath ?? t('savedServer')}</small>
        </span>
        <button style={button} onClick={() => { void probe(server.id) }}>{t('test')}</button>
      </div>)}
      {state.servers.length === 0 ? <p style={dim}>{t('noHosts')}</p> : null}
      <div style={row}>
        <button style={button} onClick={() => { setShowAddHost(value => !value) }}>{t('addSshHost')}</button>
        <button style={button} onClick={() => { void refresh().then(() => { setMessage(t('configReloaded')) }, error => { setMessage(String(error)) }) }}>{t('refresh')}</button>
      </div>
      {showAddHost ? <div style={{ ...card, padding: 12 }}>
        <input style={singleLineInput} aria-label={t('sshCommand')} placeholder="ssh user@hostname -p 22" value={hostCommand} onChange={event => { setHostCommand(event.target.value) }} />
        <strong style={{ fontSize: 14 }}>{t('chooseSshConfig')}</strong>
        {state.configFiles.map(path => <label key={path} style={{ ...row, alignItems: 'flex-start' }}>
          <input type="radio" name="ssh-config-file" checked={configPath === path} onChange={() => { setConfigPath(path) }} />
          <span>{path}</span>
        </label>)}
        <button style={button} onClick={() => { setMessage(t('customConfigGuidance')) }}>{t('customConfigAction')}</button>
        <div style={{ ...row, justifyContent: 'flex-end' }}>
          <button style={button} onClick={() => { setShowAddHost(false) }}>{t('cancel')}</button>
          <button style={primary} disabled={!hostCommand.trim() || !configPath} onClick={() => { void addHost().catch(error => { setMessage(String(error)) }) }}>{t('add')}</button>
        </div>
      </div> : null}
      {state.configErrors.map(error => <p key={error} style={dim}>{error}</p>)}
    </div>

    <div style={card}>
      <strong>{t('remoteWorkspaces')}</strong>
      {state.workspaces.map(workspace => <div key={workspace.id} style={row}>
        <span style={{ flex: 1 }}>{state.servers.find(server => server.id === workspace.serverId)?.label ?? workspace.serverId} &gt; {workspace.remotePath}</span>
        <button style={button} onClick={() => { void request(WORKSPACE_REMOVE_PATH, 'POST', { id: workspace.id }).then(refresh) }}>{t('removeMapping')}</button>
      </div>)}
      <div style={row}>
        <select style={input} aria-label={t('server')} value={serverId} onChange={event => { setServerId(event.target.value); setRemotePath(''); setShowDirectoryPicker(false) }}>
          {state.servers.map(server => <option key={server.id} value={server.id}>{server.label}</option>)}
        </select>
        <input style={input} aria-label={t('remotePath')} placeholder="/srv/project" value={remotePath} onChange={event => { setRemotePath(event.target.value) }} />
        <button style={button} disabled={!serverId} onClick={() => { setShowDirectoryPicker(true) }}>{t('browseRemote')}</button>
        <button style={primary} disabled={!serverId || !remotePath.trim()} onClick={() => { void addWorkspace().catch(error => { setMessage(String(error)) }) }}>{t('addWorkspace')}</button>
      </div>
      <WorkspaceDirectoryPicker
        t={t}
        open={showDirectoryPicker}
        title={t('selectRemoteFolder')}
        sourceKey={`remote:${serverId}`}
        initialPath={remotePath}
        list={path => request<RemoteDirectoryListing>(DIRECTORY_PATH, 'POST', { serverId, ...(path === undefined ? {} : { path }) })}
        onCancel={() => { setShowDirectoryPicker(false) }}
        onPick={path => { setRemotePath(path); setShowDirectoryPicker(false) }}
      />
      <p style={dim}>{t('tombstoneHelp')}</p>
    </div>
  </section>
}
