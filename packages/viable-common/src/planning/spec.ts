import type { Specification, Workcard } from '@owlmeans/planning'
import type { AgentProject } from '../ba/types.js'
import { viableCardHelper } from './card.js'
import { ViableSpecCategory } from './consts.js'
import type { ViableSpecHelper } from './spec/types.js'

export const createViableSpecHelper = (): ViableSpecHelper => {
  const currentSpecOf = (
    specs: readonly Specification[], category: string,
  ): Specification | null =>
    specs
      .filter(spec => spec.category === category)
      .reduce<Specification | null>((best, spec) => {
        if (best == null) return spec
        const byRevision = (spec.revision ?? 0) - (best.revision ?? 0)
        if (byRevision !== 0) return byRevision > 0 ? spec : best

        return (spec.updatedAt ?? spec.createdAt) > (best.updatedAt ?? best.createdAt) ? spec : best
      }, null)

  const currentSpecBody = (specs: readonly Specification[], category: string): string =>
    currentSpecOf(specs, category)?.body ?? ''

  const projectBriefOf = (project: Workcard, specs: readonly Specification[]): AgentProject => {
    const { language } = viableCardHelper.projectFieldsOf(project)

    return {
      name: project.title,
      ...(project.code != null ? { alias: project.code } : {}),
      description: project.description ?? '',
      specification: currentSpecBody(specs, ViableSpecCategory.Specification),
      designSystem: currentSpecBody(specs, ViableSpecCategory.DesignSystem),
      vision: currentSpecBody(specs, ViableSpecCategory.Vision),
      ...(language != null ? { language } : {}),
    }
  }

  return { currentSpecOf, currentSpecBody, projectBriefOf }
}

export const viableSpecHelper = createViableSpecHelper()
