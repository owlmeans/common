import type { BlueprintCapabilities } from '../types.js'

export interface SupportedAppCategory {
  id: string
  title: string
  description: string
  aliases?: string[]
  records?: string[]
}

export interface SupportedBlueprintCase {
  id: string
  title: string
  description: string
  capabilities: BlueprintCapabilities
  tenancy: 'single-organization' | 'multiple-organizations' | 'configurable'
  categories: SupportedAppCategory[]
  categoryKind?: 'work' | 'game'
  planningResources?: string[]
}

export interface SupportedBlueprint {
  id: string
  title: string
  language: string
  runtime: string
  framework: string
  capabilities: BlueprintCapabilities
  cases: SupportedBlueprintCase[]
}

/** Public JSON discovery, derived from the installed registry and resolved case definitions. */
export interface BlueprintCatalogue {
  version: 1
  defaultBlueprintId: string
  blueprints: SupportedBlueprint[]
}
