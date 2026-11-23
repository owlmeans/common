import { VIABLE_FEATURE_TYPE, VIABLE_USER_STORY_TYPE, ViableWorkcardStatus, WorkRerunScope } from './consts.js'
import type { WorkRerunHelper } from './rerun/types.js'

export const createWorkRerunHelper = (): WorkRerunHelper => {
  const scopes: readonly WorkRerunScope[] = Object.freeze([WorkRerunScope.Failed, WorkRerunScope.Unfinished])

  const isScope: WorkRerunHelper['isScope'] = (value): value is WorkRerunScope =>
    typeof value === 'string' && scopes.includes(value as WorkRerunScope)

  const membersOf: WorkRerunHelper['membersOf'] = (container, members, scope) => members.filter(member => {
    // A feature's planned run builds its user stories; its improvements and tasks are not its to build.
    if (container.type === VIABLE_FEATURE_TYPE && member.type !== VIABLE_USER_STORY_TYPE) return false
    if (scope === WorkRerunScope.Failed) return member.status === ViableWorkcardStatus.Failed

    return member.status !== ViableWorkcardStatus.Completed && member.status !== ViableWorkcardStatus.InProgress
  })

  const blockOf: WorkRerunHelper['blockOf'] = (container, members) => {
    if (container.status === ViableWorkcardStatus.InProgress) return 'running'
    if (members.some(member => member.status === ViableWorkcardStatus.InProgress)) return 'member'

    return null
  }

  const scopesOf: WorkRerunHelper['scopesOf'] = (container, members) => blockOf(container, members) != null
    ? []
    : scopes.filter(scope => membersOf(container, members, scope).length > 0)

  return { membersOf, blockOf, scopesOf, isScope }
}

/** The one re-run reading of the board, the platform's route and the container's run. */
export const workRerunHelper = createWorkRerunHelper()
