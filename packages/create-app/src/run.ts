import { spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { run as installSkills } from '@owlmeans/agent-skills'
import type { CreateArgs, PackageManager } from './args.js'
import { copyTemplate, isEmptyDir, templateDir } from './template.js'

const slugify = (input: string): string =>
  basename(input)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'owlmeans-app'

const titleize = (slug: string): string =>
  slug.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

const installArgs = (pm: PackageManager): string[] => pm === 'yarn' ? [] : ['install']

const log = (msg: string): void => { process.stdout.write(msg + '\n') }

export const run = async (args: CreateArgs): Promise<number> => {
  if (args.dir == null) {
    process.stderr.write('error: target directory is required, e.g. `create-app my-app`\n')
    return 2
  }

  const dest = resolve(args.dir)
  const slug = slugify(args.dir)
  const name = args.name ?? titleize(slug)

  if (!isEmptyDir(dest) && !args.yes) {
    process.stderr.write(
      `error: ${dest} is not empty. Re-run with --yes to scaffold into it anyway.\n`,
    )
    return 1
  }

  log(`\nScaffolding OwlMeans app "${name}" into ${dest}\n`)
  copyTemplate(templateDir(), dest, { slug, name })
  log('  ✓ template copied (common + api + web)')

  if (args.git) {
    const git = spawnSync('git', ['init', '-q'], { cwd: dest, stdio: 'ignore' })
    if (git.status === 0) log('  ✓ git repository initialized')
  }

  if (args.install) {
    log(`\nInstalling dependencies with ${args.pm}…`)
    const res = spawnSync(args.pm, installArgs(args.pm), { cwd: dest, stdio: 'inherit' })
    if (res.status !== 0) {
      process.stderr.write(`\nwarning: "${args.pm} install" failed — run it manually in ${dest}.\n`)
    } else {
      log('  ✓ dependencies installed')
    }
  }

  if (args.skills) {
    // Without an install the target has no node_modules/@owlmeans, so discovery falls back
    // to the installer's own bundled agent-meta/ — the general harness guidance (memory,
    // self-education, git, skill authoring) still lands; only package-specific skills wait.
    log(args.install
      ? '\nDeploying agent skills via @owlmeans/agent-skills…'
      : '\nDeploying harness guidance via @owlmeans/agent-skills (general skills only — re-run'
        + '\n`npx @owlmeans/agent-skills` after installing to add the package-specific ones)…')
    try {
      const result = await installSkills({
        dir: dest,
        yes: true,
        only: [],
        claudeOnly: false,
        copilotOnly: false,
        extras: true,
        force: false,
        dryRun: false,
        help: false,
      })
      if (result.code !== 0) {
        process.stderr.write(`  agent-skills exited with code ${result.code} — you can re-run \`npx @owlmeans/agent-skills\` later.\n`)
      }
    } catch (err) {
      process.stderr.write(`  agent-skills failed: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  }

  const runCmd = args.pm === 'npm' ? 'npm run dev' : `${args.pm} run dev`
  const installCmd = args.pm === 'yarn' ? 'yarn' : `${args.pm} install`
  log(`\nDone. Next steps:\n`)
  log(`  cd ${args.dir}`)
  if (!args.install) log(`  ${installCmd}`)
  log(`  ${runCmd}\n`)
  log('The web app starts on http://localhost:3001 and the API on http://localhost:3000.')
  log('Open the "Session" page to exercise the in-memory session resource.\n')
  log('Agent guidance was scaffolded: CLAUDE.md, .github/copilot-instructions.md and the')
  log('shared memory store at .agents/memory/MEMORY.md.')
  log('Open the project in Claude Code or Copilot — on the first session the agent will ask')
  log('what the project is for and fill in its purpose for you.\n')

  return 0
}
