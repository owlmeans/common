import { describe, expect, test } from 'bun:test'
import { Blueprint, BotKit, BotKitAction, BotPlatform, landingGatePreferenceOf, LandingGatePreference } from '../src/stack/index.js'
import type { Stack } from '../src/stack/index.js'
import { ViablePersona, ViableSkill } from '../src/skills/consts.js'

/** Just enough of a blueprint to read a preference from — the shape a test builds. */
const base = (extra: Partial<Stack> = {}): Stack => ({
  id: 'test-blueprint',
  title: 'Test',
  technology: { id: 'ts', language: 'typescript', runtime: 'bun', extensions: ['.ts'], buildScripts: {}, packageManager: 'bun' },
  framework: { id: 'owlmeans', framework: 'owlmeans', topology: {} as Stack['framework']['topology'], skills: [ViableSkill.TsStyle] },
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
  test('names both bot cases, the three kits and the kit actions, and keeps the deprecated platform enum verbatim', () => {
    expect([Blueprint.Bot, Blueprint.AiBot]).toEqual(['bot', 'ai-bot'] as Blueprint[])
    expect(Object.values(BotKit)).toEqual(['moderation', 'support', 'intake'] as BotKit[])
    expect(Object.values(BotKitAction)).toEqual(['delete', 'warn', 'mute', 'ban', 'reply', 'record', 'agent'] as BotKitAction[])
    expect(Object.values(BotPlatform)).toEqual(['telegram', 'whatsapp', 'discord', 'slack'] as BotPlatform[])
  })
})
