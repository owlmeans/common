import { SpecCategory } from '../ba/consts.js'
import type { Entity, StoryComponent, StoryScreen, UserStory } from '../ba/types.js'
import { DesignStaleness, STORY_DESIGN_VERSION } from './consts.js'
import type { StoryDesign } from './types.js'

/**
 * The in-memory aggregate the coders take, derived from the design.
 *
 * Derived rather than stored, and derived HERE rather than at the platform: the aggregate is what
 * every generation helper reads, and a second place that assembles it is a second place that can
 * assemble it differently. The `code` in particular is load-bearing - the scaffold stamps every
 * placeholder it draws with it, so a run keyed by anything else cannot recognise its own
 * reservation.
 */
export const userStoryOf = (design: StoryDesign): UserStory => {
  const componentOf = (name: string): StoryComponent | null => {
    const component = design.components.find(entry => entry.name === name)
    if (component == null) {
      return null
    }

    return {
      name: component.name,
      description: '',
      specs: {
        [SpecCategory.UX]: component.specs.ux,
        [SpecCategory.UI]: component.specs.ui,
      } as Record<SpecCategory, string>,
      entities: component.entities.map(entity => ({
        name: entity, description: '', attributes: [],
      } satisfies Entity)),
    }
  }

  const screens: StoryScreen[] = design.screens.map(screen => ({
    name: screen.name,
    description: '',
    ...(screen.section != null ? { section: screen.section } : {}),
    specs: {
      [SpecCategory.UX]: screen.specs.ux,
      [SpecCategory.UI]: screen.specs.ui,
    } as Record<SpecCategory, string>,
    components: screen.components
      .map(componentOf)
      .filter((component): component is StoryComponent => component != null),
  }))

  return {
    story: design.narrative,
    code: design.code,
    area: design.area,
    entity: null as unknown as string,
    entities: design.entities.map(entity => ({
      name: entity.name, description: entity.description, attributes: [],
    } satisfies Entity)),
    screens,
  }
}

/** Screen name to component names - the shape every UX and UI prompt takes. */
export const screenMapOf = (design: StoryDesign): Record<string, string[]> =>
  design.screens.reduce<Record<string, string[]>>((map, screen) => {
    map[screen.name] = [...screen.components]

    return map
  }, {})

/** Every path the design names, in the order the implementation stage visits them. */
export const designPaths = (design: StoryDesign): string[] => [
  ...design.types.map(entry => entry.path),
  ...design.resources.map(entry => entry.path),
  ...design.models.map(entry => entry.path),
  ...design.api.map(entry => entry.path),
  ...design.stores.map(entry => entry.path),
  ...design.components.flatMap(entry => [entry.viewModelPath, entry.path]),
  ...design.screens.map(entry => entry.path),
]

/**
 * How far the world has moved since the design was written.
 *
 * Ordered by severity, and each answer has one correct reaction: a version mismatch REFUSES, a
 * changed narrative re-designs, a changed project warns and continues, a moved tree re-runs only
 * the stages that read the tree. Collapsing them into a boolean would make every one of those the
 * most expensive of the four.
 */
export const designStaleness = (
  design: StoryDesign,
  now: { narrativeHash: string, projectHash: string, registryHash: string },
): DesignStaleness => {
  if (design.version !== STORY_DESIGN_VERSION) {
    return DesignStaleness.Version
  }
  if (design.provenance.narrativeHash !== now.narrativeHash) {
    return DesignStaleness.Narrative
  }
  if (design.provenance.projectHash !== now.projectHash) {
    return DesignStaleness.Project
  }
  if (design.provenance.registryHash !== now.registryHash) {
    return DesignStaleness.Tree
  }

  return DesignStaleness.Fresh
}

/**
 * A stable, dependency-free hash of arbitrary text.
 *
 * FNV-1a, because what is being detected is "did this change", not "is this authentic" - and a
 * design record must be readable by a browser bundle, a worker and a test with no crypto import
 * between them.
 */
export const designHash = (...parts: Array<string | undefined>): string => {
  const text = parts.filter(part => part != null).join(' ')
  let hash = 0x811c9dc5
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

/** An empty design, so every stage can fill its own slice without inventing the shape. */
export const emptyStoryDesign = (
  input: Pick<StoryDesign, 'code' | 'narrative' | 'area'> & Partial<StoryDesign>,
): StoryDesign => ({
  version: STORY_DESIGN_VERSION,
  reserved: {},
  entities: [],
  screens: [],
  components: [],
  types: [],
  resources: [],
  models: [],
  api: [],
  stores: [],
  transitions: [],
  access: { list: {}, resolvedAt: {} },
  provenance: {
    designedAt: new Date().toISOString(),
    narrativeHash: '',
    projectHash: '',
    registryHash: '',
    paths: [],
  },
  ...input,
})

/**
 * The design, small enough to hand a model, complete enough to act on.
 *
 * What a free-flight agent needs is names and counts: which screens exist, what is on them, which
 * types and endpoints the story implies. The UX and UI prose is the bulk of a design and none of
 * it helps an agent decide what to do next, so it is deliberately left out.
 */
export const designDigest = (design: StoryDesign): string => {
  const lines: string[] = [
    `Story ${design.code} (${design.area}): ${design.narrative}`,
  ]
  if (design.reserved.section != null || design.reserved.screen != null) {
    lines.push(`Reserved: section=${design.reserved.section ?? '-'} screen=${design.reserved.screen ?? '-'}`)
  }
  lines.push('', 'Screens:')
  for (const screen of design.screens) {
    lines.push(
      `- ${screen.name} -> ${screen.path} (alias ${screen.alias}`
      + `${screen.section != null ? `, section ${screen.section}` : ''}`
      + `${screen.adopted ? ', existing' : ''}) renders ${screen.components.join(', ') || '-'}`,
    )
  }
  lines.push('', 'Components:')
  for (const component of design.components) {
    lines.push(
      `- ${component.name} -> ${component.path} (+ ${component.viewModelPath})`
      + `${component.entities.length > 0 ? ` about ${component.entities.join(', ')}` : ''}`,
    )
  }
  lines.push('', 'Data layer:')
  for (const type of design.types) {
    lines.push(`- type ${type.path} (${type.entity})`)
  }
  for (const resource of design.resources) {
    lines.push(`- resource ${resource.path} (${resource.entity})`)
  }
  for (const model of design.models) {
    lines.push(`- model ${model.path} (${model.entities.join(', ')})`)
  }
  for (const api of design.api) {
    lines.push(
      `- api ${api.path} (${api.entity})`
      + `${api.endpoints.length > 0 ? `: ${api.endpoints.map(e => e.alias).join(', ')}` : ''}`,
    )
  }
  for (const store of design.stores) {
    lines.push(`- store ${store.path} (${store.entity})`)
  }
  if (design.transitions.length > 0) {
    lines.push('', 'Transitions:')
    for (const transition of design.transitions) {
      lines.push(`- ${transition.from} -> ${transition.to} (${transition.action})`)
    }
  }
  const guarded = Object.keys(design.access.list)
  if (guarded.length > 0) {
    lines.push('', `Access declared on: ${guarded.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * Apply a patch to a design, refusing anything that would rename an allocated artifact.
 *
 * A path or an alias is registry-owned. Changing one behind the registry's back leaves two
 * spellings of the same thing in a project, and no number of fix attempts repairs that — the
 * compiler sees a missing module and the fixer, reasonably, renames the reference to match
 * whichever spelling it found first.
 *
 * Returns the reason as a STRING when it refuses, so a model can read it and take the other route.
 */
export const amendStoryDesign = (
  design: StoryDesign, patch: Record<string, unknown>,
): StoryDesign | string => {
  const forbidden: string[] = []

  const checkList = <T extends { path?: string, alias?: string, name?: string }>(
    key: string, current: T[], next: unknown,
  ): void => {
    if (!Array.isArray(next)) return
    for (const entry of next as T[]) {
      const known = current.find(item => item.name === entry.name)
      if (known == null) continue
      if (entry.path != null && known.path != null && entry.path !== known.path) {
        forbidden.push(`${key}.${String(entry.name)}.path`)
      }
      if (entry.alias != null && known.alias != null && entry.alias !== known.alias) {
        forbidden.push(`${key}.${String(entry.name)}.alias`)
      }
    }
  }

  checkList('screens', design.screens, patch.screens)
  checkList('components', design.components, patch.components)

  if (forbidden.length > 0) {
    return `Refused: ${forbidden.join(', ')} name artifacts the project's registry allocated. `
      + 'A design may change what a screen or a component DOES - its UX, its UI, its section, its '
      + 'endpoints - but never where it lives or what it is called. Rename through the registry, '
      + 'or leave the name alone and change the behaviour.'
  }

  return { ...design, ...patch } as StoryDesign
}
