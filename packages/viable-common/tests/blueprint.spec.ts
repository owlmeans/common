import { describe, expect, test } from 'bun:test'
import { BotPlatform as BotPlatformOfBot } from '@owlmeans/bot'
import { BlueprintCase, BotKit, BotKitAction, BotPlatform, landingGatePreferenceOf, LandingGatePreference } from '../src/blueprint/index.js'
import type { Blueprint } from '../src/blueprint/index.js'
import { ViablePersona, ViableSkill } from '../src/skills/consts.js'

/** Just enough of a blueprint to read a preference from — the shape a test builds. */
const base = (extra: Partial<Blueprint> = {}): Blueprint => ({
  id: 'test-blueprint',
  title: 'Test',
  technology: { id: 'ts', language: 'typescript', runtime: 'bun', extensions: ['.ts'], buildScripts: {}, packageManager: 'bun' },
  stack: { id: 'owlmeans', framework: 'owlmeans', topology: {} as Blueprint['stack']['topology'], skills: [ViableSkill.TsStyle] },
  template: { id: 'seed', overlay: 'seed', patches: [] },
  createApp: { id: 'create-app', package: '@owlmeans/create-app', bare: true, template: 'bare' },
  packages: {
    id: 'packages',
    capabilities: { postgres: true, kv: false, queue: false, worker: false, agents: false, validation: true, marketingConsent: true },
    libraries: {},
    skills: [ViableSkill.ShadcnUi],
    personaSkills: { [ViablePersona.BusinessAnalyst]: [ViableSkill.MainFlowFocus] },
  },
  ...extra,
})

describe('viable-common - the landing-gate preference', () => {
  test('answers Allow for no blueprint, no layer and a value this deploy never heard of', () => {
    expect(landingGatePreferenceOf()).toBe(LandingGatePreference.Allow)
    expect(landingGatePreferenceOf(base())).toBe(LandingGatePreference.Allow)
    expect(landingGatePreferenceOf({ experience: { landingGate: 'insist' as never } }))
      .toBe(LandingGatePreference.Allow)
    expect(landingGatePreferenceOf({ experience: { landingGate: LandingGatePreference.Discourage } }))
      .toBe(LandingGatePreference.Discourage)
  })
})

describe('viable-common - the bot case vocabulary', () => {
  test('names both bot cases, the three kits and the kit actions, and re-exports the platforms of @owlmeans/bot', () => {
    expect([BlueprintCase.Bot, BlueprintCase.AiBot]).toEqual(['bot', 'ai-bot'] as BlueprintCase[])
    expect(Object.values(BotKit)).toEqual(['moderation', 'support', 'intake'] as BotKit[])
    expect(Object.values(BotKitAction)).toEqual(['delete', 'warn', 'mute', 'ban', 'reply', 'record', 'agent'] as BotKitAction[])
    expect(BotPlatform).toBe(BotPlatformOfBot)
  })
})
