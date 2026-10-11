import type { BlueprintDescriptionHelper } from './blueprints/types.js'

export const makeBlueprintDescription = (): BlueprintDescriptionHelper => ({
  render: catalogue => {
    const lines = [`Installed blueprints (default: ${catalogue.defaultBlueprintId})`]
    for (const blueprint of catalogue.blueprints) {
      lines.push('', `${blueprint.id}: ${blueprint.title}`, `Stack: ${blueprint.language}, ${blueprint.runtime}, ${blueprint.framework}`)
      for (const case_ of blueprint.cases) {
        lines.push(`  ${case_.id}: ${case_.title} (${case_.tenancy})`, `    ${case_.description}`)
        for (const category of case_.categories) {
          lines.push(`    ${category.id}: ${category.title} — ${category.description}`)
          if (category.aliases?.length) lines.push(`      also: ${category.aliases.join(', ')}`)
          if (category.records?.length) lines.push(`      records: ${category.records.join(', ')}`)
        }
        if (case_.planningResources?.length) lines.push(`    planning: ${case_.planningResources.join(', ')}`)
      }
    }
    return lines.join('\n')
  },
})

export const blueprintDescription = makeBlueprintDescription()
