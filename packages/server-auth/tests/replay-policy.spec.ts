import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthRole } from '@owlmeans/auth'
import { makeAuthModel } from '../src/manager/model.js'
import { AuthChallengeReplayPolicy } from '../src/manager/plugins/replay-policy.js'
import { registerPlugin } from '../src/manager/plugins/index.js'
import { makeTestContext } from './context.js'

describe('@owlmeans/server-auth — plugin-owned challenge replay', () => {
  test('lets a bounded-retry plugin receive a second credential attempt', async () => {
    const type = `replay-policy-${Date.now()}`
    let attempts = 0
    registerPlugin(type, () => ({
      type,
      challengeReplayPolicy: AuthChallengeReplayPolicy.Plugin,
      init: async () => ({ challenge: 'opaque-issuance' }),
      authenticate: async () => {
        attempts += 1
        if (attempts === 1) throw new AuthenFailed('first-guess')
        return { token: '' }
      },
    }))

    const { context } = makeTestContext()
    await context.configure().init()
    const model = makeAuthModel(context as never)
    const { challenge } = await model.init({ type, userId: 'retry@example.com' })
    const credential = () => ({
      type, challenge, credential: 'guess', userId: 'retry@example.com',
      role: AuthRole.User, scopes: ['*'],
    })

    await expect(model.authenticate(credential())).rejects.toBeInstanceOf(AuthenFailed)
    await expect(model.authenticate(credential())).resolves.toHaveProperty('token')
    expect(attempts).toBe(2)
  })
})
