import p from 'node:path'

import { ROOT_ENV_FILE } from './consts.js'
import type { SetupReport } from './types.js'
import type { SetupReportModel } from './report/types.js'

/**
 * What a project needs before it can run here, read off one setup report.
 */
export const makeSetupReportModel = (report: SetupReport): SetupReportModel => {
  const missingServices = (): Array<'database' | 'queue'> => [
    ...(report.database.reachable ? [] : ['database' as const]),
    ...(report.needsWorker && !report.queue.reachable ? ['queue' as const] : []),
  ]

  const dockerPostgres = (port: number): string =>
    `docker run -d --name viable-postgres -e POSTGRES_PASSWORD=viable -e POSTGRES_USER=viable`
    + ` -e POSTGRES_DB=viable -p ${port}:5432 postgres:18.6-alpine`

  const dockerValkey = (port: number): string =>
    `docker run -d --name viable-valkey -p ${port}:6379 valkey/valkey:9.1.2-alpine`

  const nativeInstall = (platform: NodeJS.Platform): string[] =>
    platform === 'darwin'
      ? ['  brew install postgresql@18 && brew services start postgresql@18',
         '  brew install valkey && brew services start valkey']
      : platform === 'win32'
        ? ['  winget install PostgreSQL.PostgreSQL',
           '  (a queue store is easiest through Docker Desktop on Windows)']
        : ['  sudo apt install postgresql redis-server   # Debian/Ubuntu',
           '  sudo systemctl enable --now postgresql redis-server']

  const renderSetupGuide = (): string => {
    const missing = missingServices()
    const lines: string[] = [`Project: ${report.dir}`, '']

    lines.push('What this machine provides:')
    lines.push(`  bun      ${report.tools.bun ? 'yes' : 'NO — install it from https://bun.sh'}`)
    lines.push(`  git      ${report.tools.git ? 'yes' : 'NO — the project keeps its own history'}`)
    lines.push(`  database ${report.database.reachable
      ? `yes — ${report.database.redacted ?? 'configured'}`
      : report.database.configured
        ? `configured but NOT answering — ${report.database.redacted ?? ''}`
        : 'not configured'}`)
    lines.push(`  queue    ${report.needsWorker
      ? report.queue.reachable
        ? `yes — ${report.queue.redacted ?? 'configured'}`
        : report.queue.configured ? 'configured but NOT answering' : 'not configured'
      : 'not needed — this project has no background worker'}`)
    lines.push('')

    if (missing.length < 1) {
      lines.push('Everything the application needs is in place. Call run_local to build and start it.')

      return lines.join('\n')
    }

    const what = missing.map(one => one === 'database' ? 'a Postgres database' : 'a queue store (Valkey or Redis)')
    lines.push(
      `ASK THE USER — this project still needs ${what.join(' and ')}, and only they can say how to`,
      'provide it. Put these three choices to them in your own words and wait for an answer:',
      '',
      '  1. "I already have one"  — running here, on another machine, or a service you already pay',
      '     for. Ask for the connection string and nothing else.',
      '  2. "Install one here"    — the commands are below; run them only if they choose this.',
      '  3. "Use a free hosted plan" — Supabase or Neon for Postgres, Upstash for Redis. They sign',
      '     up, create a project, and copy the connection string.',
      '',
      'Then call set_local_service with what they gave you. Do not invent a connection string, and do',
      'not install anything before they have chosen.',
      '',
    )

    if (missing.includes('database')) {
      lines.push('--- 2. Install Postgres here ---')
      lines.push(report.tools.docker
        ? `  ${dockerPostgres(5432)}`
        : '  Docker is not installed. Either install Docker, or use the native package:')
      if (!report.tools.docker) lines.push(nativeInstall(report.platform)[0])
      lines.push(
        '  Then the connection string is:',
        '    postgres://viable:viable@localhost:5432/viable',
        '',
        '--- 3. Free hosted Postgres ---',
        '  Supabase: https://supabase.com → New project → Settings → Database → Connection string',
        '            (choose the "URI" form; it already carries the password)',
        '  Neon:     https://neon.tech → New project → Connection string',
        '  Either gives a `postgres://…` URL that goes straight into set_local_service.',
        '',
      )
    }

    if (missing.includes('queue')) {
      lines.push('--- A queue store, for this project\'s worker ---')
      lines.push(report.tools.docker
        ? `  ${dockerValkey(6379)}`
        : nativeInstall(report.platform)[1])
      lines.push(
        '  Then: redis://localhost:6379',
        '  Free hosted: https://upstash.com → Redis → Create database → copy the `redis://…` URL.',
        '',
      )
    }

    lines.push(
      '--- Where the value goes ---',
      `  Into ${p.join(report.dir, ROOT_ENV_FILE)}, OUTSIDE the block marked "viable:managed".`,
      '  set_local_service writes it there for you. The platform never overwrites a key you set,',
      '  and the credential never reaches the project marker, your agent\'s configuration, or the',
      '  platform.',
      report.envIgnored
        ? '  That file is git-ignored, so the credential stays out of the project\'s history.'
        : '  WARNING: .env is NOT git-ignored in this project. Say so before writing a credential.',
    )

    return lines.join('\n')
  }

  return { report, missingServices, renderSetupGuide }
}
