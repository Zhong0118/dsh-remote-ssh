import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import { OPEN_FILE_PATH, request, STATE_PATH } from './api.ts'
import type { CatalogState } from './api.ts'
import { resolveRemoteOpenWorkspace } from './open-route.ts'

interface RemoteOpenResponse {
  kind: 'editor' | 'download'
  localPath?: string
}

/** Transparently route chat/tool file links through the owning remote Workspace. */
export function installRemoteOpenPath(ctx: Context): void {
  const session = ctx.remote.session
  const previous = session.openWorkspacePath.bind(session)
  const routed: typeof session.openWorkspacePath = async (input, signal) => {
    const path = input.path
    const state = await request<CatalogState>(STATE_PATH)
    const sessions = ctx.sessions.list.getSnapshot()
    const current = sessions.current
    const cwd = current === undefined ? undefined : sessions.byId[current]?.cwd
    const workspace = resolveRemoteOpenWorkspace(state.workspaces, path, cwd)
    if (workspace === undefined) return previous(input, signal)

    const result = await request<RemoteOpenResponse>(OPEN_FILE_PATH, 'POST', {
      workspaceId: workspace.id,
      path,
    })
    if (result.kind === 'editor') return { ok: true, value: { opened: true } }
    if (result.localPath === undefined) throw new Error('remote download did not return a local path')
    return previous({ path: result.localPath }, signal)
  }
  session.openWorkspacePath = routed
  ctx.effect(() => () => {
    if (session.openWorkspacePath === routed) session.openWorkspacePath = previous
  }, 'dsh-remote-ssh: openPath router')
}
