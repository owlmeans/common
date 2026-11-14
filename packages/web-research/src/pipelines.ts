import { RESEARCH_LIMITS } from './consts.js'
import { makeRunArea } from './pipelines/area.js'
import { makeSourceCloner } from './pipelines/clone.js'
import { makeDesignPipeline } from './pipelines/design.js'
import { makeImplementationPipeline } from './pipelines/implementation.js'
import { makePackagesPipeline } from './pipelines/packages.js'
import { makeProjectPipeline } from './pipelines/project.js'
import { makeSourceScreener } from './pipelines/screening.js'
import { makeSkillPipeline } from './pipelines/skill.js'
import { makeSourcesHelper } from './pipelines/sources.js'
import type { ResearchPipelines, ResearchWiring } from './pipelines/types.js'
import type { ResearchKit, ResearchRunnerOptions } from './pipelines/types.local.js'
import { STRONG_SIGNAL_KINDS } from './screen/consts.js'

/**
 * Every research pipeline over one wiring. Cheap to call: a consumer whose models or store are per
 * run (an execution, a project's scope) builds the pipelines per run; a resumed run is rebuilt the
 * same way and continues from its row.
 */
export const makeResearchPipelines = (wiring: ResearchWiring): ResearchPipelines => {
  const limits = { ...RESEARCH_LIMITS, ...wiring.limits }
  const runner: ResearchRunnerOptions = {
    ...(wiring.runs != null ? { runs: wiring.runs } : {}),
    ...(wiring.checkpointer != null ? { checkpointer: wiring.checkpointer } : {}),
    ...(wiring.fatal != null ? { fatal: wiring.fatal } : {}),
    ...(wiring.maxStateChars != null ? { maxStateChars: wiring.maxStateChars } : {}),
    ...(wiring.trace != null ? { trace: wiring.trace } : {}),
    ...(wiring.onProgress != null ? { onProgress: wiring.onProgress } : {}),
  }
  const sources = wiring.store.sources
  const kit: ResearchKit = {
    wiring,
    limits,
    runner,
    sources: makeSourcesHelper({ sources, limits }),
    area: runId => makeRunArea(sources, runId),
    cloner: area => makeSourceCloner(area, sources, wiring.reader, limits),
    screener: (area, purpose) => makeSourceScreener({
      area, sources, judge: wiring.screen ?? null, strong: wiring.strongSignals ?? STRONG_SIGNAL_KINDS, purpose,
    }),
  }
  const packages = makePackagesPipeline(kit)

  return {
    implementation: makeImplementationPipeline(kit),
    project: makeProjectPipeline(kit),
    design: makeDesignPipeline(kit),
    packages,
    skill: makeSkillPipeline(kit, packages),
  }
}
