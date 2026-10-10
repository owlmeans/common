import { WorkcardConflict, type PlanningRecord, type PlanningRecordStore } from '@owlmeans/planning'
import { recordQueryHelper } from '@owlmeans/resource'
import { quoteIdent } from '@owlmeans/postgres-resource'
import { sqlHelper } from '../sql.js'
import type { RecordPortDeps } from './records/types.js'

/** Native table-backed compare-and-set; every lookup is organization scoped. */
export const makeRecordPort = <R extends PlanningRecord>(deps: RecordPortDeps): PlanningRecordStore<R> => {
  const { col, recordOf, insertOf, driverValue } = sqlHelper
  return {
    get: async (id, entityId) => {
      const { runner, tables } = await deps.sql()
      const table = tables[deps.table]
      const [row] = await runner.query(`SELECT * FROM ${table.qualified} WHERE ${col(table, 'id')}=$1 AND ${col(table, 'entityId')}=$2`, [id, entityId])
      return row == null ? null : recordOf<R>(row, table)
    },
    list: async (where, opts) => {
      const { runner, tables } = await deps.sql()
      const table = tables[deps.table]
      const rows = await runner.query(`SELECT * FROM ${table.qualified} WHERE ${col(table, 'entityId')}=$1`, [where.entityId])
      return recordQueryHelper.applyQuery(rows.map(row => recordOf<R>(row, table)), where, opts)
    },
    put: async record => {
      const { runner, tables } = await deps.sql()
      const table = tables[deps.table]
      const written = { ...record, id: record.id ?? deps.ids() }
      try {
        let rows: Record<string, unknown>[]
        if (record.version === 1) {
          const statement = insertOf(table, written as unknown as Record<string, unknown>, { tail: 'RETURNING *' })
          rows = await runner.query(statement.text, statement.params)
        } else {
          const columns = table.columns.filter(column => column.property !== 'id' && column.property !== 'entityId')
          const params = columns.map(column => driverValue(column, (written as unknown as Record<string, unknown>)[column.property]))
          params.push(written.id, written.entityId, written.version - 1)
          rows = await runner.query(`UPDATE ${table.qualified} SET ${columns.map((column, index) => `${quoteIdent(column.column)}=$${index + 1}`).join(', ')} WHERE ${col(table, 'id')}=$${columns.length + 1} AND ${col(table, 'entityId')}=$${columns.length + 2} AND ${col(table, 'version')}=$${columns.length + 3} RETURNING *`, params)
        }
        if (rows[0] == null) throw new WorkcardConflict(`${deps.table}:${written.id}:version:${record.version}`)
        return recordOf<R>(rows[0], table)
      } catch (error) {
        if (sqlHelper.pgFault(error).code === '23505') throw new WorkcardConflict(`${deps.table}:identity-taken`)
        throw error
      }
    },
    drop: async (id, entityId, version) => {
      const { runner, tables } = await deps.sql()
      const table = tables[deps.table]
      const rows = await runner.query(`DELETE FROM ${table.qualified} WHERE ${col(table, 'id')}=$1 AND ${col(table, 'entityId')}=$2 AND ${col(table, 'version')}=$3 RETURNING *`, [id, entityId, version])
      if (rows.length !== 1) throw new WorkcardConflict(`${deps.table}:${id}:version:${version}`)
    },
  }
}
