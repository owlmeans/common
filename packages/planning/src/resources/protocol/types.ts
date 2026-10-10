import type { PlanningReply } from '../../helpers/reply/types.js'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import type { ListResult } from '@owlmeans/resource'
import type { AssigneeDraft, TeamDraft, CommentDraft, PlanningRecord } from '../types.js'

export interface PlanningResourceQueryWire { query?: string }
export interface PlanningResourceCommand {
  action: 'create' | 'update' | 'retire' | 'remove' | 'members' | 'projects' | 'assignees' | 'addMember' | 'removeMember' | 'attach' | 'detach' | 'rebuild'
  id?: string
  draft?: Partial<AssigneeDraft & TeamDraft & CommentDraft>
  version?: number
  assignee?: string
  project?: string
}
export type PlanningResourceReply = PlanningRecord | PlanningRecord[] | string[] | null

export interface PlanningResourceProtocols<R extends PlanningRecord = PlanningRecord> {
  get: EntrypointProtocol<{ params: { id: string } }, PlanningReply<R>>
  list: EntrypointProtocol<{ query: PlanningResourceQueryWire }, PlanningReply<ListResult<R>>>
  write: EntrypointProtocol<{ body: PlanningResourceCommand }, PlanningReply<PlanningResourceReply>>
}
