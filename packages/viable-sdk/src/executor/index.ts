import p from 'node:path'

import { SlotCommandType, SlotFileCommand, SlotGitCommand, SlotShellCommand, type SlotCommandPayload, type SlotGitCommand as SlotGitCommandType, type SubProject, slotCommandHelper } from '@owlmeans/viable-common'

import { createLocalFileHelper } from './files.js'
import { makeLocalGitHelper } from './git.js'
import { integrityHelper } from './integrity.js'
import { makeLayoutHelper } from './layout.js'
import { createLocalShellHelper } from './shell.js'
import { spawnHelper } from './spawn.js'
import type { LocalSlotExecutor, LocalSlotExecutorOptions } from './types.js'

export * from './errors.js'
export * from './layout.js'
export type * from './layout/types.js'
export * from './integrity.js'
export type * from './integrity/types.js'
export * from './files.js'
export type * from './files/types.js'
export type * from './types.js'
export * from './env.js'
export type * from './env/types.js'
export * from './health.js'
export type * from './health/types.js'
export * from './consts.js'
export * from './boot-check.js'
export * from './shell.js'
export type * from './shell/types.js'
export * from './git.js'
export type * from './git/types.js'
export * from './spawn.js'
export type * from './spawn/types.js'
export { BUILD_TIMEOUT, MAX_OUTPUT_BUFFER } from './consts.js'

/**
 * Answer the platform's slot commands against a directory on this machine.
 *
 * The dispatcher is the publisher's, switch for switch, and that is the point: the platform's
 * remote helpers parse the ANSWERS, and they have no way to know whether a pod or a laptop
 * produced one. So an ordinary failure is never thrown here — it comes back in the same shape the
 * publisher would have sent, error text and all — and only an unknown command, which is a
 * protocol fault rather than a project fault, escapes as an exception.
 *
 * Everything is resolved per call rather than closed over: a re-initialization replaces the tree
 * under a running connector, and a remembered layout would then resolve every path into a
 * directory that no longer exists.
 */
export const makeLocalSlotExecutor = (
  dir: string, opts: LocalSlotExecutorOptions = {}
): LocalSlotExecutor => {
  const root = p.resolve(dir)
  const log = opts.log ?? (() => undefined)

  const execute = async ({ type, command, args }: SlotCommandPayload): Promise<unknown> => {
    const fileHelper = createLocalFileHelper(root)
    const shellHelper = createLocalShellHelper(fileHelper, args?.subproject as SubProject | undefined)

    log(`Executing command [${type}]: ${command}`)

    return await spawnHelper.withDeadline(`${type}:${command}`, slotCommandHelper.commandDeadline(type, command), async () => {
      switch (type) {
        case SlotCommandType.Files:
          switch (command) {
            case SlotFileCommand.EmptyProject:
              await fileHelper.emptyProject(args?.ignore)
              integrityHelper.forgetIntegrity()

              return {}

            case SlotFileCommand.DeleteProject:
              await fileHelper.deleteProject()
              integrityHelper.forgetIntegrity()

              return {}

            case SlotFileCommand.InitializeProject:
              await fileHelper.initializeProject()
              integrityHelper.forgetIntegrity()

              return {}

            case SlotFileCommand.GetSourceList:
              return await fileHelper.getSourceList(args?.pattern, args?.options)

            case SlotFileCommand.GetStructuredList:
              return await fileHelper.getStructuredList(args?.patterns)

            case SlotFileCommand.ReadFile:
              return { result: await fileHelper.readFile(args?.filePath, args?.noThrow) }

            case SlotFileCommand.ReadSource:
              return await fileHelper.readSource(args?.filePath)

            case SlotFileCommand.ReadPossibleSource:
              return await fileHelper.readPossibleSource(args?.filePath)

            case SlotFileCommand.ReadSources:
              return await fileHelper.readSources(args?.files)

            case SlotFileCommand.WriteFile:
              await fileHelper.writeFile(args?.filePath, args?.content)
              integrityHelper.forgetIntegrity()

              return {}

            case SlotFileCommand.WriteSource:
              await fileHelper.writeSource(args?.file)
              integrityHelper.forgetIntegrity()

              return {}

            case SlotFileCommand.DeleteFile:
              await fileHelper.deleteFile(args?.filePath, args?.noThrow)
              integrityHelper.forgetIntegrity()

              return {}

            case SlotFileCommand.StatTree:
              return await fileHelper.statTree(args?.dir, args?.limit)

            case SlotFileCommand.ReadHead:
              // `{ result }`, exactly like ReadFile: the platform's remote helper reads one field
              // for "the text of a file", and a second shape for the same thing would be a second
              // parser to keep in step.
              return { result: await fileHelper.readHead(args?.path, args?.bytes) }

            case SlotFileCommand.Relocate: {
              const result = await fileHelper.relocate(args?.dir, args?.keep)
              integrityHelper.forgetIntegrity()

              return result
            }

            case SlotFileCommand.RemoveTree:
              await fileHelper.removeTree(args?.dir)
              integrityHelper.forgetIntegrity()

              return {}

            case SlotFileCommand.FindFilesWithEnvVars:
              return await fileHelper.findFilesWithEnvVars(args?.frontend)

            case SlotFileCommand.GetRootPath:
              return { result: fileHelper.getRootPath(args?.subproject) }

            default:
              throw new Error(`Unknown command: ${command}`)
          }

        case SlotCommandType.Shell:
          switch (command) {
            case SlotShellCommand.Bun:
              return { result: await shellHelper.bun(args?.args, args?.options) }

            case SlotShellCommand.Reinstall:
              // Lockfile cleared, then installed. A plain `bun install` here would reinstall
              // exactly the versions already pinned on disk, which is the whole problem.
              return { result: await shellHelper.reinstall() }

            case SlotShellCommand.BuildCommon:
              return { result: await shellHelper.buildCommon() }

            case SlotShellCommand.Validate:
              return { result: await shellHelper.validate(args?.subproject) }

            case SlotShellCommand.ValidateWithRenderer:
              return { result: await shellHelper.validateWithRenderer() }

            case SlotShellCommand.Build: {
              const result = await shellHelper.build()
              // The tree changed, so the next spawn re-reads it rather than trusting the verdict
              // this build was admitted on.
              integrityHelper.forgetIntegrity()

              return { result }
            }

            case SlotShellCommand.ValidateBackend:
              return { result: await shellHelper.validateBackend() }

            case SlotShellCommand.DbSync:
              return { result: await shellHelper.dbSync() }

            case SlotShellCommand.BootCheck: {
              const report = await shellHelper.bootCheck({
                skipBuild: args?.skipBuild === true, wait: args?.wait === true,
              })

              // The shell contract is "error text or null", so a healthy boot reports null exactly
              // like a clean build; `started` is what tells a caller to begin polling.
              return report == null
                ? { result: null, started: true }
                : { result: report.ok ? null : report.error, phase: report.phase }
            }

            case SlotShellCommand.BootCheckStatus: {
              const status = await shellHelper.bootCheckStatus()

              return {
                running: status.running,
                startedAt: status.startedAt,
                done: !status.running && status.report != null,
                result: status.report == null || status.report.ok ? null : status.report.error,
                phase: status.report?.phase ?? null,
              }
            }

            case SlotShellCommand.Integrity:
              return await shellHelper.integrity()

            default:
              throw new Error(`Unknown command: ${command}`)
          }

        case SlotCommandType.Git: {
          const result = await makeLocalGitHelper(root).dispatchGitCommand(command as SlotGitCommandType, args)
          if (command === SlotGitCommand.Discard || command === SlotGitCommand.RevertTo) {
            // Both rewrite the working tree wholesale, so the memoized verdict describes a tree
            // that no longer exists.
            integrityHelper.forgetIntegrity()
          }

          return result
        }

        default:
          throw new Error(`Unknown command type: ${String(type)}`)
      }
    })
  }

  return {
    execute,
    layout: () => makeLayoutHelper(root).targetPaths(),
    integrity: async () => await integrityHelper.verifyTarget(root),
    dir: root,
  }
}

export type { LocalSlotExecutor, LocalSlotExecutorOptions } from './types.js'
