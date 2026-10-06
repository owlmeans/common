import { SpecCategory } from '../ba/consts.js'
import type { Entity, StoryComponent, StoryScreen, UserStory } from '../ba/types.js'
import { DesignStaleness, STORY_DESIGN_VERSION } from './consts.js'
import type { StoryDesign } from './types.js'
import type { StoryDesignHelper } from './story/types.js'

export const createStoryDesignHelper = (): StoryDesignHelper => {
  const userStoryOfDesign = (design: StoryDesign): UserStory => {
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

  const screenMapOf = (design: StoryDesign): Record<string, string[]> =>
    design.screens.reduce<Record<string, string[]>>((map, screen) => {
      map[screen.name] = [...screen.components]

      return map
    }, {})

  const designPaths = (design: StoryDesign): string[] => [
    ...design.types.map(entry => entry.path),
    ...design.resources.map(entry => entry.path),
    ...design.models.map(entry => entry.path),
    ...design.api.map(entry => entry.path),
    ...design.stores.map(entry => entry.path),
    ...design.components.flatMap(entry => [entry.viewModelPath, entry.path]),
    ...design.screens.map(entry => entry.path),
  ]

  const designStaleness = (
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

  const designHash = (...parts: Array<string | undefined>): string => {
    const text = parts.filter(part => part != null).join(' ')
    let hash = 0x811c9dc5
    for (let at = 0; at < text.length; at += 1) {
      hash ^= text.charCodeAt(at)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }

    return hash.toString(16).padStart(8, '0')
  }

  const emptyStoryDesign = (
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

  const designDigest = (design: StoryDesign): string => {
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

  const amendStoryDesign = (
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

  return {
    userStoryOfDesign, screenMapOf, designPaths, designStaleness, designHash, emptyStoryDesign, designDigest,
    amendStoryDesign,
  }
}

export const storyDesignHelper = createStoryDesignHelper()
