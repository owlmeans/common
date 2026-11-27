import type { StackCapabilities } from '../types.js'

export interface SupportedCase {
  id: string
  title: string
  description: string
  aliases?: string[]
  records?: string[]
}

export interface SupportedBlueprint {
  id: string
  title: string
  description: string
  capabilities: StackCapabilities
  tenancy: 'single-organization' | 'multiple-organizations' | 'configurable'
  categories: SupportedCase[]
  categoryKind?: 'work' | 'game' | 'bot'
  planningResources?: string[]
  /** A bot case's supported messaging platform ids, in the order the deployment offers them. */
  botPlatforms?: string[]
}

export interface SupportedStack {
  id: string
  title: string
  language: string
  runtime: string
  framework: string
  capabilities: StackCapabilities
  cases: SupportedBlueprint[]
}

/** Public JSON discovery, derived from the installed registry and resolved case definitions. */
export interface StackCatalogue {
  version: 1
  defaultBlueprintId: string
  blueprints: SupportedStack[]
}
