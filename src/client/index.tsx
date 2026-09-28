/** Browser entry: locale registration, transparent openPath routing, and slots. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
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

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Remote SSH settings, picker, and file-opening copy. */
    'settings.remote-ssh': RemoteSshLocaleKey
  }
}

export const name = 'dsh-remote-ssh-client'
export const inject = ['slots', 'uiWorkspace', 'sessions', 'locale', 'remote', 'remote.session']

/** Register the localized settings, workspace flow, and transparent file opener. */
export function apply(ctx: Context): void {
  const namespace = 'settings.remote-ssh'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-remote-ssh: client copy')
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
        entries: listing.entries.map((entry: { name: string; path: string }) => ({ name: entry.name, path: entry.path })),
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

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'remote-ssh',
    order: 16,
    label: 'Remote SSH',
    locale: namespace,
    inject: () => ({ t }),
  }, RemoteSshPluginCard))
}
