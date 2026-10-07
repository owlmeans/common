import { WorkloadKind, type ConnectConfigSaveBody, type ConnectConfigValue, type ConnectProjectConfig } from '@owlmeans/viable-common'
import type { ConfigHelper } from './config/types.js'

export const createConfigHelper = (): ConfigHelper => {
  /** One side's map as the wire's list; a side the call did not name stays absent. */
  const valuesOf = (map: unknown): ConnectConfigValue[] | undefined => {
    if (map == null || typeof map !== 'object' || Array.isArray(map)) return undefined
    const values = Object.entries(map as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([name, value]) => ({ name: name.trim(), value }))

    return values.length > 0 ? values : undefined
  }

  const configBody = (args: Record<string, unknown>): ConnectConfigSaveBody => {
    const backend = valuesOf(args.backend)
    const frontend = valuesOf(args.frontend)

    return { ...(backend != null ? { backend } : {}), ...(frontend != null ? { frontend } : {}) }
  }

  const namesOf = (body: ConnectConfigSaveBody): string[] =>
    [...(body.backend ?? []), ...(body.frontend ?? [])].map(variable => variable.name)

  const renderConfiguration = (projectId: string, config: ConnectProjectConfig): string => {
    const missing = [...config.backend, ...config.frontend].filter(variable => !variable.set)
      .map(variable => variable.name)
    const lines = [
      `configuration of ${projectId} · ${config.scope === WorkloadKind.Production
        ? 'production (taken at the next Publish)' : 'preview'}`,
      `backend (${config.backend.length}) — values are secrets and are never shown:`,
      ...(config.backend.length > 0
        ? config.backend.map(variable => `  ${variable.name}: ${variable.set ? 'set' : 'NOT SET'}`)
        : ['  none declared']),
      `frontend (${config.frontend.length}) — public, built into the pages every visitor loads:`,
      ...(config.frontend.length > 0
        ? config.frontend.map(variable => `  ${variable.name}: ${variable.set ? variable.value : 'NOT SET'}`)
        : ['  none declared']),
    ]
    if (missing.length > 0) lines.push(`still without a value: ${missing.join(', ')}`)
    lines.push('next: update_project_configuration to set any of them; recollect_configuration when the'
      + ' sources declare variables this list does not show')

    return lines.join('\n')
  }

  return { configBody, namesOf, renderConfiguration }
}

export const configHelper = createConfigHelper()
