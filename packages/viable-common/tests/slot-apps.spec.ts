import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import {
  APP_BUILD_DEADLINE_STEP, COMMAND_DEADLINES, COMMAND_TIMEOUTS, DEFAULT_COMMAND_DEADLINE, SHELL_COMMAND_TIMEOUTS,
  SLOT_RUNTIME_CAPABILITIES, SlotCommandType, SlotDatabaseCommand, SlotFileCommand, SlotGitCommand, SlotRuntimeCapability,
  SlotShellCommand,
} from '../src/slot/consts.js'
import { slotCommandHelper } from '../src/slot/command.js'
import { commandDeadline, commandTimeout } from '../src/slot/utils.js'
import { SlotCommandPayloadSchema } from '../src/slot/schemas.js'

/**
 * The slot wire gains an `app` argument, two commands and a bound that grows with a split target's
 * build. Without a scale every bound is what it always was, for every command of every type.
 */
const EVERY: Array<[SlotCommandType, string[]]> = [
  [SlotCommandType.Shell, Object.values(SlotShellCommand)],
  [SlotCommandType.Files, Object.values(SlotFileCommand)],
  [SlotCommandType.Git, Object.values(SlotGitCommand)],
  [SlotCommandType.Database, Object.values(SlotDatabaseCommand)],
]

describe('viable-common - slot command bounds for a split target', () => {
  test('without a scale, or with one app, every deadline and timeout is unchanged', () => {
    for (const [type, commands] of EVERY) {
      for (const command of commands) {
        const deadline = slotCommandHelper.commandDeadline(type, command)
        const timeout = slotCommandHelper.commandTimeout(type, command)
        expect(slotCommandHelper.commandDeadline(type, command, {})).toBe(deadline)
        expect(slotCommandHelper.commandDeadline(type, command, { apps: 1 })).toBe(deadline)
        expect(slotCommandHelper.commandTimeout(type, command, undefined, { apps: 1 })).toBe(timeout)
        expect(commandDeadline(type, command)).toBe(deadline)
        expect(commandTimeout(type, command)).toBe(timeout)
      }
    }
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Shell, SlotShellCommand.Build)).toBe(360_000)
    expect(slotCommandHelper.commandTimeout(SlotCommandType.Shell, SlotShellCommand.Build)).toBe(380_000)
  })

  test('a build grows by 240 s per app beyond main, on both bounds; nothing else grows', () => {
    expect(APP_BUILD_DEADLINE_STEP).toBe(240_000)
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Shell, SlotShellCommand.Build, { apps: 3 })).toBe(360_000 + 480_000)
    expect(slotCommandHelper.commandTimeout(SlotCommandType.Shell, SlotShellCommand.Build, undefined, { apps: 3 })).toBe(380_000 + 480_000)
    for (const command of Object.values(SlotShellCommand).filter(command => command !== SlotShellCommand.Build)) {
      expect(slotCommandHelper.commandDeadline(SlotCommandType.Shell, command, { apps: 3 }))
        .toBe(slotCommandHelper.commandDeadline(SlotCommandType.Shell, command))
    }
    // An explicit override wins, exactly as before.
    expect(slotCommandHelper.commandTimeout(SlotCommandType.Shell, SlotShellCommand.Build, 5_000, { apps: 3 })).toBe(5_000)
    // Nonsense counts scale nothing.
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Shell, SlotShellCommand.Build, { apps: 0 })).toBe(360_000)
    expect(slotCommandHelper.commandDeadline(SlotCommandType.Shell, SlotShellCommand.Build, { apps: Number.NaN })).toBe(360_000)
  })

  test('the caller still outlasts the executor for every shell command, split or not', () => {
    for (const command of Object.values(SlotShellCommand)) {
      for (const scale of [undefined, { apps: 10 }]) {
        expect(slotCommandHelper.commandTimeout(SlotCommandType.Shell, command, undefined, scale))
          .toBeGreaterThan(slotCommandHelper.commandDeadline(SlotCommandType.Shell, command, scale))
      }
    }
  })
})

describe('viable-common - the two runtime commands', () => {
  test('restarting one app is bounded like a process start; the runtime read is short', () => {
    expect(SlotShellCommand.RestartApp).toBe('restartApp')
    expect(SlotShellCommand.RuntimeInfo).toBe('runtimeInfo')
    expect(COMMAND_DEADLINES[SlotShellCommand.RestartApp]).toBe(120_000)
    expect(SHELL_COMMAND_TIMEOUTS[SlotShellCommand.RestartApp]).toBe(160_000)
    expect(COMMAND_DEADLINES[SlotShellCommand.RuntimeInfo]).toBeLessThan(DEFAULT_COMMAND_DEADLINE)
    expect(SHELL_COMMAND_TIMEOUTS[SlotShellCommand.RuntimeInfo]).toBeLessThan(COMMAND_TIMEOUTS[SlotCommandType.Shell]!)
  })

  test('the capabilities a runtime of this version reports', () => {
    expect([...SLOT_RUNTIME_CAPABILITIES]).toEqual(['apps', 'restart-app'])
    expect(Object.values(SlotRuntimeCapability)).toEqual([...SLOT_RUNTIME_CAPABILITIES])
  })

  test('the payload schema carries the new commands and an app argument', () => {
    const validate = new Ajv({ strict: false }).compile(SlotCommandPayloadSchema)
    expect(validate({ type: SlotCommandType.Shell, command: SlotShellCommand.RestartApp, args: { app: 'admin' } })).toBe(true)
    expect(validate({ type: SlotCommandType.Shell, command: SlotShellCommand.RuntimeInfo })).toBe(true)
    expect(validate({ type: SlotCommandType.Shell, command: SlotShellCommand.Build, args: { app: 'admin' } })).toBe(true)
  })
})
