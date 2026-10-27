import type { RecordInteractionHelper, RecordInteractionPlan } from './types.js'

export const createRecordInteractionHelper = (): RecordInteractionHelper => {
  const identity = (screen: string): string => screen.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const hostEntity = (plan: RecordInteractionPlan): string =>
    plan.placement === 'destination' && plan.standaloneReason?.trim() && plan.capabilities.includes('list')
      ? plan.entity : plan.ownerEntity || plan.entity
  const isHostScreen = (plan: RecordInteractionPlan, screen: string): boolean =>
    plan.hostScreen != null && identity(plan.hostScreen) === identity(screen)
  const menuEligible = (plan: RecordInteractionPlan | undefined, screen: string): boolean | undefined => {
    if (plan == null) return undefined
    if (plan.hostKind === 'record') return false
    if (plan.hostScreen != null) return isHostScreen(plan, screen)
    return plan.placement === 'destination' ? undefined : false
  }

  return { hostEntity, isHostScreen, menuEligible }
}

export const recordInteractionHelper = createRecordInteractionHelper()
