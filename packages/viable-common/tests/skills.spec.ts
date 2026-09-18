import { describe, expect, it } from 'bun:test'

import { ViableSkill } from '../src/skills/consts.js'
import { viableSkill } from '../src/skills/catalogue.js'

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

  it('OwlmeansContext and OwlmeansState show no project-common/project-backend deep import with an extension', () => {
    for (const alias of [ViableSkill.OwlmeansContext, ViableSkill.OwlmeansState]) {
      expect(viableSkill(alias).body).not.toMatch(/project-(?:common|backend)\/[^\s'"`]*\.(?:js|type)\b/)
    }
  })
})
