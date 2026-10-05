import fs from 'fs-extra'
import path from 'node:path'
import { ConnectHarness } from '@owlmeans/viable-common'
import { harnessFiles } from './templates.js'
import type { HarnessFile, HarnessHelper, InstallOptions, InstallResult } from './types.js'
import { BEGIN, END } from './consts.local.js'

export const createHarnessHelper = (): HarnessHelper => {
  const describeHarness = (harness: ConnectHarness): HarnessFile[] => harnessFiles(harness)

  /**
   * Replace only the block this connector owns, leaving everything a person wrote alone.
   *
   * An instruction file belongs to its project: overwriting it to add a paragraph would delete
   * whatever else was in it, and appending unconditionally would grow a duplicate on every install.
   * The markers make the update idempotent and the ownership visible to whoever reads the file next.
   */
  const mergeSection = (existing: string, section: string): string => {
    const from = existing.indexOf(BEGIN)
    const to = existing.indexOf(END)
    if (from >= 0 && to > from) {
      return existing.slice(0, from) + section + existing.slice(to + END.length)
    }

    return existing.trimEnd() === '' ? `${section}\n` : `${existing.trimEnd()}\n\n${section}\n`
  }

  /** Merge one key into a JSON configuration the project also uses for other things. */
  const mergeJson = (existing: string, keys: string[], value: unknown): string => {
    let root: Record<string, unknown> = {}
    if (existing.trim() !== '') {
      try {
        root = JSON.parse(existing) as Record<string, unknown>
      } catch {
        // A configuration we cannot parse is one somebody is editing. Refusing to touch it is the
        // only safe answer — overwriting would destroy every other server they had configured.
        throw new Error('the existing configuration is not valid JSON; fix it and install again')
      }
    }
    let cursor = root
    for (const key of keys.slice(0, -1)) {
      if (typeof cursor[key] !== 'object' || cursor[key] == null) cursor[key] = {}
      cursor = cursor[key] as Record<string, unknown>
    }
    cursor[keys[keys.length - 1]] = value

    return `${JSON.stringify(root, null, 2)}\n`
  }

  const installHarness = async (
    dir: string, harness: ConnectHarness, opts: InstallOptions = {}
  ): Promise<InstallResult> => {
    const written: string[] = []
    const skipped: string[] = []

    for (const file of harnessFiles(harness)) {
      if (file.jsonKey != null && opts.mcpConfig !== true) {
        skipped.push(file.path)
        continue
      }

      const full = path.join(dir, file.path)
      const existing = await fs.pathExists(full) ? await fs.readFile(full, 'utf-8') : ''

      const next = file.jsonKey != null
        ? mergeJson(existing, file.jsonKey, JSON.parse(file.content))
        : file.section === true
          ? mergeSection(existing, file.content)
          : `${file.content.trimEnd()}\n`

      if (next === existing) {
        skipped.push(file.path)
        continue
      }

      await fs.outputFile(full, next)
      written.push(file.path)
    }

    return { written, skipped }
  }

  return { describeHarness, installHarness }
}

export const harnessHelper = createHarnessHelper()
