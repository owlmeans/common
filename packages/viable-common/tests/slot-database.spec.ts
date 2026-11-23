import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import {
  COMMAND_TIMEOUTS, DATABASE_BACKUP_LIMITS, DATABASE_CHANGE_LIMITS, DATABASE_COMMAND_DEADLINES, DATABASE_COMMAND_TIMEOUTS,
  DEFAULT_DATABASE_COMMAND_DEADLINE, SlotCommandType, SlotDatabaseCommand,
} from '../src/slot/consts.js'
import { slotCommandHelper } from '../src/slot/command.js'
import { SlotCommandPayloadSchema } from '../src/slot/schemas.js'

/** A task's data change and the backup taken before it ride the database command type. */
describe('viable-common - slot database task commands', () => {
  test('the vocabulary keeps its wire values', () => {
    expect(Object.values(SlotDatabaseCommand))
      .toEqual(['databaseInfo', 'databaseQuery', 'databaseChange', 'databaseDump', 'databaseRestore'])
  })

  test('inspection keeps its bounds; a change, dump and restore get their own', () => {
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Database, SlotDatabaseCommand.Info)).toBe(DEFAULT_DATABASE_COMMAND_DEADLINE)
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Database, SlotDatabaseCommand.Query)).toBe(30_000)
    expect(slotCommandHelper.commandTimeout(SlotCommandType.Database, SlotDatabaseCommand.Query)).toBe(COMMAND_TIMEOUTS[SlotCommandType.Database]!)
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Database, SlotDatabaseCommand.Change)).toBeGreaterThanOrEqual(45_000)
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Database, SlotDatabaseCommand.Dump)).toBeGreaterThanOrEqual(120_000)
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Database, SlotDatabaseCommand.Restore)).toBeGreaterThanOrEqual(360_000)
  })

  test('the caller outlasts the executor for every database command', () => {
    for (const command of Object.values(SlotDatabaseCommand)) {
      expect(slotCommandHelper.commandTimeout(SlotCommandType.Database, command))
        .toBeGreaterThan(slotCommandHelper.commandDeadline(SlotCommandType.Database, command))
    }
    for (const command of Object.keys(DATABASE_COMMAND_DEADLINES) as SlotDatabaseCommand[]) {
      expect(DATABASE_COMMAND_TIMEOUTS[command]).toBe(DATABASE_COMMAND_DEADLINES[command]! + 40_000)
    }
  })

  test('the executor deadlines cover the statement timeouts they wrap', () => {
    expect(DATABASE_COMMAND_DEADLINES[SlotDatabaseCommand.Change]!).toBeGreaterThan(DATABASE_CHANGE_LIMITS.timeoutMs)
    expect(DATABASE_COMMAND_DEADLINES[SlotDatabaseCommand.Dump]!).toBeGreaterThan(DATABASE_BACKUP_LIMITS.dumpTimeoutMs)
    expect(DATABASE_COMMAND_DEADLINES[SlotDatabaseCommand.Restore]!).toBeGreaterThan(DATABASE_BACKUP_LIMITS.restoreTimeoutMs)
  })

  test('the payload schema carries the three commands', () => {
    const validate = new Ajv({ strict: false }).compile(SlotCommandPayloadSchema)
    for (const command of [SlotDatabaseCommand.Change, SlotDatabaseCommand.Dump, SlotDatabaseCommand.Restore]) {
      expect(validate({ type: SlotCommandType.Database, command, args: {} })).toBe(true)
    }
  })
})
