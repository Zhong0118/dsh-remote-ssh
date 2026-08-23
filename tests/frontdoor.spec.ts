import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as WebAdapter from '../src/profiles/web.ts'

describe('optional front-door adapters', () => {
  it('activates the Web adapter without a webServer service', async () => {
    const ctx = new Context()
    ctx.provide('remoteSshManager', {} as never)

    const web = ctx.plugin(WebAdapter)
    await web.await()
    expect(ctx.get('webServer')).toBeUndefined()

    await ctx.fiber.dispose()
  })
})
