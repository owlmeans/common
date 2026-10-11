import { COMMAND_DEADLINES, COMMAND_TIMEOUTS, DEFAULT_COMMAND_DEADLINE, DEFAULT_COMMAND_TIMEOUT, DEFAULT_FILE_COMMAND_DEADLINE, DEFAULT_GIT_COMMAND_DEADLINE, FILE_COMMAND_DEADLINES, FILE_COMMAND_TIMEOUTS, GIT_COMMAND_DEADLINES, GIT_COMMAND_TIMEOUTS, SHELL_COMMAND_TIMEOUTS, SlotCommandType, SlotFileCommand, SlotGitCommand } from './consts.js'
import type { SlotCommandHelper } from './command/types.js'

export const createSlotCommandHelper = (): SlotCommandHelper => {
  /** The per-command caller bound for one command, or nothing where its type's default is right. */
  const perCommandTimeout = (type: SlotCommandType, command: string): number | undefined => {
    switch (type) {
      case SlotCommandType.Shell: return SHELL_COMMAND_TIMEOUTS[command]
      case SlotCommandType.Git: return GIT_COMMAND_TIMEOUTS[command as SlotGitCommand]
      case SlotCommandType.Database: return COMMAND_TIMEOUTS[SlotCommandType.Database]
      default: return FILE_COMMAND_TIMEOUTS[command as SlotFileCommand]
    }
  }

  const commandTimeout = (
    type: SlotCommandType, command: string, override?: number
  ): number => override
    ?? perCommandTimeout(type, command)
    ?? COMMAND_TIMEOUTS[type]
    ?? DEFAULT_COMMAND_TIMEOUT

  const commandDeadline = (type: SlotCommandType, command: string): number => {
    switch (type) {
      case SlotCommandType.Shell:
        return COMMAND_DEADLINES[command] ?? DEFAULT_COMMAND_DEADLINE
      case SlotCommandType.Git:
        return GIT_COMMAND_DEADLINES[command as SlotGitCommand] ?? DEFAULT_GIT_COMMAND_DEADLINE
      case SlotCommandType.Database:
        return 30_000
      default:
        return FILE_COMMAND_DEADLINES[command as SlotFileCommand] ?? DEFAULT_FILE_COMMAND_DEADLINE
    }
  }

  return { commandTimeout, commandDeadline }
}

export const slotCommandHelper = createSlotCommandHelper()
