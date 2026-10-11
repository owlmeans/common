import { slotCommandHelper } from './command.js'
import type { SlotCommandType } from './consts.js'

/** @deprecated compat:factory-refactor — use `slotCommandHelper.commandTimeout(…)` */
export const commandTimeout = (type: SlotCommandType, command: string, override?: number): number =>
  slotCommandHelper.commandTimeout(type, command, override)

/** @deprecated compat:factory-refactor — use `slotCommandHelper.commandDeadline(…)` */
export const commandDeadline = (type: SlotCommandType, command: string): number =>
  slotCommandHelper.commandDeadline(type, command)
