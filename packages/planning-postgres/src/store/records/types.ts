import type { PlanningTables, SqlContext } from '../../types.js'

export interface RecordPortDeps {
  sql: () => Promise<SqlContext>
  table: Extract<keyof PlanningTables, 'assignee' | 'team' | 'comment' | 'mention'>
  ids: () => string
}
