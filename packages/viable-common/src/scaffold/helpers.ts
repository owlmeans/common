import { scaffoldShareHelper } from './share.js'
import type { ScaffoldPlan, ShareKind } from './types.js'

/** @deprecated compat:factory-refactor — use `scaffoldShareHelper.shareOwner(…)` */
export const shareOwner = (plan: Pick<ScaffoldPlan, 'stories'>, code: string, kind: ShareKind = 'widget'): string =>
  scaffoldShareHelper.shareOwner(plan, code, kind)

/** @deprecated compat:factory-refactor — use `scaffoldShareHelper.shareGroups(…)` */
export const shareGroups = (plan: Pick<ScaffoldPlan, 'stories'>, kind: ShareKind = 'widget'): Map<string, string[]> =>
  scaffoldShareHelper.shareGroups(plan, kind)

/** @deprecated compat:factory-refactor — use `scaffoldShareHelper.shareMembers(…)` */
export const shareMembers = (plan: Pick<ScaffoldPlan, 'stories'>, owner: string, kind: ShareKind = 'widget'): string[] =>
  scaffoldShareHelper.shareMembers(plan, owner, kind)

/** @deprecated compat:factory-refactor — use `scaffoldShareHelper.ownsShare(…)` */
export const ownsShare = (plan: Pick<ScaffoldPlan, 'stories'>, code: string, kind: ShareKind = 'widget'): boolean =>
  scaffoldShareHelper.ownsShare(plan, code, kind)
