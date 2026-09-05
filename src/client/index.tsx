/** Browser entry: locale registration, transparent openPath routing, and slots. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { en, zh } from './locales.ts'
import type { RemoteSshLocaleKey } from './locales.ts'
import type { RemoteDirectoryListing } from './api.ts'
import { RemoteSshPluginCard } from './RemoteSshPluginCard.tsx'
import { RemoteSshSettings } from './RemoteSshSettings.tsx'
import { RemoteWorkspaceFlow } from './RemoteWorkspaceFlow.tsx'
import type { RemoteWorkspaceFlowInjected } from './RemoteWorkspaceFlow.tsx'
import { installRemoteOpenPath } from './open-path.ts'
import { REMOTE_BACKEND_CONTEXT_PATH, type RemoteBackendContext } from '../backend-context.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Remote SSH settings, picker, and file-opening copy. */
    'settings.remote-ssh': RemoteSshLocaleKey
  }
}

export const name = 'dsh-remote-ssh-client'
export const inject = ['slots', 'uiWorkspace', 'sessions', 'locale']

/** Register the localized settings, workspace flow, and transparent file opener. */
export async function apply(ctx: Context): Promise<void> {
  const namespace = 'settings.remote-ssh'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-remote-ssh: client copy')
  if (await isRemoteBackendWindow()) return
  const t = ctx.locale.bind(namespace) as RemoteWorkspaceFlowInjected['t']
  installRemoteOpenPath(ctx)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'remote-ssh',
    order: 16,
    label: () => t('nav'),
    locale: namespace,
    inject: () => ({ t }),
  }, RemoteSshSettings))

  const injected = (): RemoteWorkspaceFlowInjected => ({
    t,
    listLocal: async (path?: string): Promise<RemoteDirectoryListing> => {
      const listing = await ctx.uiWorkspace.listDirectory(path)
      const parent = listing.crumbs.length > 1 ? listing.crumbs[listing.crumbs.length - 2]?.path : undefined
      return {
        path: listing.path,
        home: listing.home,
        ...(parent === undefined ? {} : { parent }),
        entries: listing.entries.map(entry => ({ name: entry.name, path: entry.path })),
      }
    },
  })
  ctx.slots.inject('conversation.hero.workspace.directoryFlow', () =>
    ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
      yield ctx.slots.register({
        name: 'conversation.hero.workspace.directoryFlow',
        locale: namespace,
        inject: injected,
      }, RemoteWorkspaceFlow)
      yield ctx.slots.register({
        name: 'sidebar.workspaces.directoryFlow',
        locale: namespace,
        inject: injected,
      }, RemoteWorkspaceFlow)
    }))

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'remote-ssh',
    locale: namespace,
    inject: () => ({ t }),
  }, RemoteSshPluginCard))
}

/** Detect the gateway before registering any local-only Remote SSH chrome. */
export async function isRemoteBackendWindow(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(REMOTE_BACKEND_CONTEXT_PATH, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return false
    const value = await response.json() as Partial<RemoteBackendContext>
    return value.attached === true && value.transport === 'ssh'
  } catch {
    return false
  }
}
