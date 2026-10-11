import type { ToolDefinition, ToolHost } from '../types.js'

/** The catalogue as a host sees it. */
export interface CatalogueHelper {
  /** The tools a given host actually offers. */
  visibleTools: (host: ToolHost) => ToolDefinition[]
  toolByName: (name: string) => ToolDefinition | undefined
}
