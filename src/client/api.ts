export const STATE_PATH = '/plugins/dsh-remote-ssh/state'
export const WORKSPACE_PATH = '/plugins/dsh-remote-ssh/workspace'
export const WORKSPACE_REMOVE_PATH = '/plugins/dsh-remote-ssh/workspace/remove'
export const LOCAL_WORKSPACE_PATH = '/plugins/dsh-remote-ssh/local-workspace'
export const PROBE_PATH = '/plugins/dsh-remote-ssh/probe'
export const CONFIG_HOST_PATH = '/plugins/dsh-remote-ssh/ssh-config/host'
export const SETTINGS_PATH = '/plugins/dsh-remote-ssh/settings'
export const DIRECTORY_PATH = '/plugins/dsh-remote-ssh/directory'
export const OPEN_FILE_PATH = '/plugins/dsh-remote-ssh/open-file'

export type OpenFileMode = 'auto' | 'vscode' | 'cursor' | 'windsurf' | 'vscodium' | 'custom' | 'download'

export interface Server {
  id: string
  label: string
  sshTarget: string
  source: 'ssh-config' | 'saved'
  configPath?: string
  hostName?: string
  user?: string
  port?: number
}

export interface Workspace {
  id: string
  serverId: string
  remotePath: string
  aliasPath: string
}

export interface RemoteDirectoryListing {
  path: string
  home: string
  parent?: string
  entries: Array<{ name: string; path: string }>
}

export interface CatalogState {
  servers: Server[]
  workspaces: Workspace[]
  serverCount: number
  discoveredServerCount: number
  workspaceCount: number
  configFiles: string[]
  loadedConfigFiles: string[]
  configErrors: string[]
  customConfigFile?: string
  openFileMode: OpenFileMode
  openFileEditorPath?: string
}

export const emptyCatalog: CatalogState = {
  servers: [],
  workspaces: [],
  serverCount: 0,
  discoveredServerCount: 0,
  workspaceCount: 0,
  configFiles: [],
  loadedConfigFiles: [],
  configErrors: [],
  openFileMode: 'auto',
}

export async function request<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value
      ? String(value.error)
      : `HTTP ${response.status}`
    throw new Error(message)
  }
  return value as T
}
