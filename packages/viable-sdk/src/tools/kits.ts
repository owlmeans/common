import type { ConnectKitApplyResult, PlanningKitView } from '@owlmeans/viable-common'

/**
 * One kit as a parent reads it: what it is for, the container its cards live in, each card type
 * with its main flow, and each flow's statuses in order (the planning intrinsic in brackets).
 */
const renderKit = (kit: PlanningKitView): string => {
  const flows = new Map(kit.flows.map(flow => [flow.key, flow]))
  return [
    `${kit.id} · ${kit.title} (${kit.kind})`,
    `  ${kit.purpose}`,
    `  container: ${kit.container.label} (${kit.container.key})`,
    ...kit.types.map(type => `  type ${type.key} · ${type.label} — flow ${flows.get(type.flow)?.label ?? type.flow}`),
    ...kit.flows.map(flow => `  flow ${flow.key}: ${flow.statuses.map(status => `${status.label} [${status.intrinsic}]`).join(' → ')}`),
  ].join('\n')
}

export const renderKits = (projectId: string, kits: PlanningKitView[]): string => kits.length < 1
  ? `no planning kits are offered for ${projectId}`
  : [
    `planning kits for ${projectId}`,
    ...kits.map(renderKit),
    'next: apply_planning_kit with a kit id (and the type keys to keep, or none for every type)',
  ].join('\n\n')

export const renderKitApply = (projectId: string, kit: string, result: ConnectKitApplyResult): string => [
  `planning kit ${kit} applied to ${projectId}`,
  `written: ${result.applied.length > 0 ? result.applied.join(', ') : 'nothing'}`,
  ...(result.skipped.length > 0 ? [`left out: ${result.skipped.join(', ')}`] : []),
  ...result.warnings.map(warning => `warning: ${warning}`),
  'The platform rebuilds the preview with the new types; list_stories and project_status show the project as it stands.',
].join('\n')
