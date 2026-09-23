import { describe, expect, it } from 'bun:test'

import { SKILL_ORDER, ViableSkill } from '../src/skills/consts.js'
import { VIABLE_SKILLS, viableSkill } from '../src/skills/catalogue.js'
import { VIABLE_PERSONAS, ViablePersona } from '../src/skills/roles.js'

/**
 * Pins the catalogue's own "wrap exactly once" teaching — the incident this guards against was
 * the catalogue itself showing a handler module that wraps itself (`OwlMeansServer`), while the
 * deterministic stampers and every OTHER skill always wrap again at the binding site. Both halves
 * have to agree, or a coder reading both produces exactly the double wrap that made every request
 * to a "completed" story fail with `TypeError: handler is not a function`.
 */
describe('viable-common catalogue — handler wrap-once', () => {
  it('OwlMeansServer shows a plain handler module, the single wrap at bind, and the WRONG double wrap', () => {
    const body = viableSkill(ViableSkill.OwlMeansServer).body

    expect(body).toContain('handleTaskCreate')
    expect(body).toContain('api.body(protocols.api.task.create, handleTaskCreate)')
    expect(body).toContain('WRONG')
    expect(body).toContain('BoundEntrypointHandler')
    expect(body).toContain('handler is not a function')
  })

  it('WorkerJobs §3 does not say the processor module itself calls handlers()', () => {
    const body = viableSkill(ViableSkill.WorkerJobs).body

    expect(body).not.toContain('created with `handlers<Context>()`')
    expect(body).toContain('PLAIN exported async function')
    expect(body).toContain('WRONG')
    expect(body).toContain('handleReportBuildJob')
  })

  it('FixerHeuristics reads a double-wrapped binding and a wrong-extension package specifier', () => {
    const body = viableSkill(ViableSkill.FixerHeuristics).body

    expect(body).toContain('BoundEntrypointHandler')
    expect(body).toContain('TWICE')
    expect(body).toContain("project-common/")
    expect(body).toContain("project-backend/")
  })

  it('OwlMeansServer types a handler with the shared type its protocol declares, never an invented payload type', () => {
    const body = viableSkill(ViableSkill.OwlMeansServer).body

    expect(body).not.toContain('TaskCreatePayload')
    expect(body).toContain('payload: Task, ctx: Context')
    expect(body).toContain('The PROTOCOL decides the handler\'s types')
  })

  it('FixerHeuristics repairs a handler/protocol mismatch in the HANDLER, never in the declaration', () => {
    const body = viableSkill(ViableSkill.FixerHeuristics).body

    expect(body).toContain('HANDLER disagreeing with its protocol')
    expect(body).toContain('Never edit the declaration toward the handler')
  })

  it('OwlmeansContext and OwlmeansState show no project-common/project-backend deep import with an extension', () => {
    for (const alias of [ViableSkill.OwlmeansContext, ViableSkill.OwlmeansState]) {
      expect(viableSkill(alias).body).not.toMatch(/project-(?:common|backend)\/[^\s'"`]*\.(?:js|type)\b/)
    }
  })
})

/**
 * The prompt service SKIPS an alias it cannot resolve, so a skill in the enum with no body is a
 * rule no model ever receives — nothing fails, the prompt simply lacks it.
 */
describe('viable-common catalogue — completeness', () => {
  it('declares one body and one sort weight for every skill in the enum', () => {
    const declared = VIABLE_SKILLS.map(entry => entry.alias)

    expect(Object.values(ViableSkill).filter(alias => !declared.includes(alias))).toEqual([])
    expect(new Set(declared).size).toBe(declared.length)
    for (const alias of Object.values(ViableSkill)) {
      expect(typeof SKILL_ORDER[alias], alias).toBe('number')
    }
  })
})

/**
 * The house style is taught in two places a designer and a coder read — the visual designer's
 * persona and the shadcn skill — and a template ships the same values. Neither may drift back
 * to teaching the decoration the template now paints flat.
 */
describe('viable-common catalogue — the house style', () => {
  it('ShadcnUi teaches the white ground, one accent and flat depth, and repaints the old classes', () => {
    const body = viableSkill(ViableSkill.ShadcnUi).body

    expect(body).toContain('bg-background')
    expect(body).toContain('ONE product accent')
    expect(body).toContain('shadow-floating')
    expect(body).toContain('REPAINTED flat')
    expect(body).toContain('explicitly asks')
    expect(body).not.toContain('DECORATION VOCABULARY')
    expect(body).not.toMatch(/\/\/ right[^\n]*gradient/)
    expect(body).toContain('SelectItem')
  })

  it('the visual designer defaults to the house style and changes it only on an explicit ask', () => {
    const role = VIABLE_PERSONAS[ViablePersona.VisualDesigner].role

    expect(role).toContain('white ground')
    expect(role).toContain('ONE')
    expect(role).toContain('explicitly asks')
    expect(role).not.toContain('expressive and bright')
    expect(role).not.toMatch(/default to .*gradients/)
  })

  it('LandingGate teaches the gate card, the synchronous handoff and the screen that reads it', () => {
    const body = viableSkill(ViableSkill.LandingGate).body

    expect(body).toContain('data-home-gate')
    expect(body).toContain('aria-pressed')
    expect(body).toContain('useLandingStart(target)')
    expect(body).toContain('useLandingContinuation')
    expect(body).toContain('readLandingHandoff')
    expect(body).toContain('clearLandingHandoff()')
    // Named only as the thing NOT to do: its continuation lands on the guarded screen.
    expect(body).toContain('NEVER `useLogin(target)`')
    expect(body).toContain('SYNCHRONOUS')
    expect(body).toContain('WRONG')
    expect(body).not.toContain('${')
  })
})
