import { describe, expect, test } from 'bun:test'
import {
  applyBlueprintCase, BLUEPRINT_CASES, BlueprintCase, landingGatePreferenceOf, LandingGatePreference,
  personaSkillsOf,
} from '../src/blueprint/index.js'
import type { Blueprint } from '../src/blueprint/index.js'
import { ViableSkill } from '../src/skills/consts.js'
import { ViablePersona } from '../src/skills/roles.js'

/** Just enough of a blueprint for a case to be applied to — the shape a test builds. */
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

  test('each case weighs the gate: web and the AI kinds encourage, scalable allows, a game discourages', () => {
    const preferences = Object.fromEntries(Object.values(BlueprintCase).map(id =>
      [id, landingGatePreferenceOf(applyBlueprintCase(base(), id))]))

    expect(preferences).toEqual({
      [BlueprintCase.Web]: LandingGatePreference.Encourage,
      [BlueprintCase.Scalable]: LandingGatePreference.Allow,
      [BlueprintCase.AiPipeline]: LandingGatePreference.Encourage,
      [BlueprintCase.AiAgent]: LandingGatePreference.Encourage,
      [BlueprintCase.Game]: LandingGatePreference.Discourage,
    })
  })

  test('a case overrides the base layer key by key, and no case leaves a blueprint without one', () => {
    const allowing = base({ experience: { landingGate: LandingGatePreference.Allow } })

    expect(landingGatePreferenceOf(applyBlueprintCase(allowing, BlueprintCase.Game)))
      .toBe(LandingGatePreference.Discourage)
    expect(applyBlueprintCase(base(), undefined).experience).toBeUndefined()
    expect(Object.isFrozen(applyBlueprintCase(base(), BlueprintCase.Web).experience)).toBe(true)
  })
})

describe('viable-common - the landing-gate skill in the cases', () => {
  const gatePersonas = [
    ViablePersona.BusinessAnalyst, ViablePersona.UxDesigner, ViablePersona.LayoutArchitect,
    ViablePersona.ComponentArchitect, ViablePersona.UiViewCoder, ViablePersona.UiNavCoder,
  ]

  test('reaches the analyst and the frontend personas of every encouraging case, and nobody else', () => {
    for (const id of [BlueprintCase.Web, BlueprintCase.AiPipeline, BlueprintCase.AiAgent]) {
      const cased = applyBlueprintCase(base(), id)
      for (const persona of gatePersonas) {
        expect(personaSkillsOf(cased, persona), `${id} → ${persona}`).toContain(ViableSkill.LandingGate)
      }
      expect(personaSkillsOf(cased, ViablePersona.ApiCoder)).not.toContain(ViableSkill.LandingGate)
    }
    for (const id of [BlueprintCase.Scalable, BlueprintCase.Game]) {
      const cased = applyBlueprintCase(base(), id)
      for (const persona of gatePersonas) {
        expect(personaSkillsOf(cased, persona), `${id} → ${persona}`).not.toContain(ViableSkill.LandingGate)
      }
    }
  })

  test('is merged with what a case and the base already give a persona, never in place of it', () => {
    const agent = applyBlueprintCase(base(), BlueprintCase.AiAgent)

    expect(personaSkillsOf(agent, ViablePersona.BusinessAnalyst)).toEqual([
      ViableSkill.MainFlowFocus, ViableSkill.AgenticChoice, ViableSkill.LandingGate,
    ])
    expect(personaSkillsOf(agent, ViablePersona.UxDesigner))
      .toEqual([ViableSkill.AgenticChoice, ViableSkill.LandingGate])
    expect(personaSkillsOf(agent, ViablePersona.WorkerCoder)).toEqual([
      ViableSkill.AgenticChoice, ViableSkill.TargetLlm, ViableSkill.LibrariesAi,
      ViableSkill.TargetAgentTools,
    ])
    expect(BLUEPRINT_CASES[BlueprintCase.AiPipeline].patch.packages?.personaSkills?.[ViablePersona.BusinessAnalyst])
      .toEqual([ViableSkill.AgenticChoice, ViableSkill.LandingGate])
  })
})
