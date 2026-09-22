import { describe, expect, test } from 'bun:test'
import { makeFlowModel } from '@owlmeans/flow'
import { OAUTH_PAYLOAD_KIND, OAUTH_PAYLOAD_REF, OAuthFlowStep, oauthFlow, oauthFlowProvider } from '../src/flow.js'

describe('oauthFlow', () => {
  test('starts on consent, and verify is reachable by name', async () => {
    const model = await makeFlowModel(oauthFlow)
    expect(model.step().step).toBe(OAuthFlowStep.Consent)

    model.enter(OAuthFlowStep.Verify)
    expect(model.step().step).toBe(OAuthFlowStep.Verify)
  })

  test('consent approves straight to done, carrying the payload', async () => {
    const model = await makeFlowModel(oauthFlow)
    model.updatePayload({ [OAUTH_PAYLOAD_KIND]: 'device', [OAUTH_PAYLOAD_REF]: 'ABCD-EFGH' })
    const token = model.transit('approve', true)
    expect(model.step().step).toBe(OAuthFlowStep.Done)

    const restored = await makeFlowModel(token, oauthFlowProvider)
    expect(restored.step().step).toBe(OAuthFlowStep.Done)
    expect(restored.payload()[OAUTH_PAYLOAD_KIND]).toBe('device')
    expect(restored.payload()[OAUTH_PAYLOAD_REF]).toBe('ABCD-EFGH')
  })

  test('sign-in is an explicit transition to the platform dispatcher, and next() returns from it', async () => {
    const model = await makeFlowModel(oauthFlow)
    expect(model.transitions(true).map(t => t.transition)).toContain('sign-in')

    model.transit('sign-in', true)
    expect(model.step().module).toBe('dispatcher')

    const back = model.next()
    expect(back.step).toBe(OAuthFlowStep.Consent)
  })

  test('the provider refuses any name but the one flow', async () => {
    await expect(oauthFlowProvider('not-this-flow')).rejects.toThrow()
  })
})
