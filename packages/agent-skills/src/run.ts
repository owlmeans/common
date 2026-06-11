import { resolve } from 'node:path'
import type { CliArgs } from './args.js'
import { discover } from './discover.js'
import { detectLinked } from './linked.js'
import { planInstall } from './plan.js'
import { applyInstall } from './apply.js'
import { confirm, closeReadline, isTTY } from './prompt.js'
import type { InstallAction, InstallItem } from './plan.js'

const ACTION_LABEL: Record<InstallAction, string> = {
  'install': 'install',
  'skip-uptodate': 'up-to-date',
  'update': 'update',
  'conflict': 'CONFLICT',
}

const padEnd = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - s.length))

const printTable = (items: InstallItem[]): void => {
  const colWidths = {
    kind: 11,
    name: Math.max(...items.map(i => i.entry.name.length), 4) + 2,
    pkg: Math.max(...items.map(i => i.entry.packageName.length), 7) + 2,
    action: 10,
  }

  const header =
    padEnd('kind', colWidths.kind) +
    padEnd('name', colWidths.name) +
    padEnd('package', colWidths.pkg) +
    'action'
  process.stdout.write(header + '\n')
  process.stdout.write('-'.repeat(header.length) + '\n')

  for (const item of items) {
    const kindLabel = item.entry.kind === 'skill' ? 'skill' : 'instruction'
    const actionLabel = ACTION_LABEL[item.action]
    process.stdout.write(
      padEnd(kindLabel, colWidths.kind) +
      padEnd(item.entry.name, colWidths.name) +
      padEnd(item.entry.packageName, colWidths.pkg) +
      actionLabel +
      '\n',
    )
  }
  process.stdout.write('\n')
}

export type RunResult =
  | { code: 0 }
  | { code: 2; message: string }  // CLI parse
  | { code: 3; message: string }  // nothing found
  | { code: 4; message: string }  // linked refusal
  | { code: 5; message: string }  // unresolved conflicts

export const run = async (args: CliArgs): Promise<RunResult> => {
  const targetDir = resolve(args.dir)

  // 1. Linked monorepo check
  if (!args.force) {
    const linked = detectLinked(targetDir)
    if (linked.linked) {
      const pkgList = linked.evidence.slice(0, 5).join(', ')
      const more = linked.evidence.length > 5 ? ` (+${linked.evidence.length - 5} more)` : ''
      process.stderr.write(
        `\nerror: linked monorepo detected — ${pkgList}${more} are symlinked.\n\n` +
        `In this setup, agents already load guidance from the linked monorepo's\n` +
        `root .claude/skills/ and .github/instructions/. Installing embedded copies\n` +
        `would place stale duplicates that conflict with the canonical live files.\n\n` +
        `Pass --force only if you understand this and want to proceed anyway.\n\n`,
      )
      return { code: 4, message: 'linked monorepo' }
    }
  }

  // 2. Discover
  const entries = discover(targetDir, {
    extras: args.extras,
    only: args.only.length > 0 ? args.only : undefined,
    claudeOnly: args.claudeOnly,
    copilotOnly: args.copilotOnly,
  })

  if (entries.length === 0) {
    process.stdout.write(
      `No embedded @owlmeans/* agent guidance found in node_modules.\n` +
      `Install @owlmeans/* packages first, then re-run.\n`,
    )
    return { code: 3, message: 'nothing found' }
  }

  // 3. Plan
  const items = planInstall(entries, targetDir, { force: args.force })

  // 4. Print table
  process.stdout.write('\n')
  printTable(items)

  if (args.dryRun) {
    process.stdout.write('(dry-run — no files written)\n')
    return { code: 0 }
  }

  // 5. Count actionable items
  const toWrite = items.filter(i => i.action === 'install' || i.action === 'update')
  const conflicts = items.filter(i => i.action === 'conflict')

  if (toWrite.length === 0 && conflicts.length === 0) {
    process.stdout.write('Everything up to date.\n')
    closeReadline()
    return { code: 0 }
  }

  // 6. Interactive: confirm per conflict, or if not --yes confirm overall
  const resolvedItems = [...items]

  if (isTTY() && !args.yes && toWrite.length > 0) {
    const ok = await confirm(`Install ${toWrite.length} file(s) into ${targetDir}?`)
    if (!ok) {
      process.stdout.write('Aborted.\n')
      closeReadline()
      return { code: 0 }
    }
  }

  // Per-conflict prompts in interactive mode
  if (isTTY() && conflicts.length > 0) {
    for (const item of resolvedItems) {
      if (item.action !== 'conflict') continue
      const ok = await confirm(
        `  ${item.entry.name} has local edits — overwrite ${item.targetPath}?`,
      )
      if (ok) {
        // Upgrade to update
        Object.assign(item, { action: 'update' })
      }
    }
  }

  closeReadline()

  const remainingConflicts = resolvedItems.filter(i => i.action === 'conflict')
  if (remainingConflicts.length > 0) {
    process.stdout.write(
      `\nSkipping ${remainingConflicts.length} file(s) with local edits:\n`,
    )
    for (const c of remainingConflicts) {
      process.stdout.write(`  ${c.targetPath}\n`)
    }
    process.stdout.write(`Pass --force to overwrite.\n\n`)

    // In non-interactive --yes mode with remaining conflicts, exit 5
    if (!isTTY() && !args.yes && !args.force) {
      return { code: 5, message: 'unresolved conflicts' }
    }
  }

  // 7. Apply
  const result = applyInstall(resolvedItems)

  process.stdout.write(
    `Done: ${result.installed} installed, ${result.updated} updated, ` +
    `${result.skipped} up-to-date, ${result.conflicts} skipped (conflicts).\n`,
  )

  return { code: 0 }
}
