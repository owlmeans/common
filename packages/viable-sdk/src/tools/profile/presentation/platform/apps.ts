import { MAIN_APP } from '@owlmeans/viable-common'
import { presentReadHelper as read } from './read.js'
import type { AppsPresentHelper } from './types.js'

export const createAppsPresentHelper = (): AppsPresentHelper => {
  const pathOf = (mount: string): string => mount === '' ? '/' : `/${mount}`

  const apps = read.total((structured, args) => {
    // A local run's lines (`localRun`) by name — the only live facts a local project has.
    const local = new Map(read.records(structured.localRun).map(entry => [read.text(entry.name), entry]))
    const listed = read.records(structured.apps)
    const source = listed.length > 0 ? listed : [...local.values()]
    const presented = source.map(entry => {
      const name = read.text(entry.name, MAIN_APP)
      const mount = read.text(entry.mount)
      const run = local.get(name)

      return read.compact({
        name,
        path: pathOf(mount),
        areas: read.texts(entry.areas),
        main: read.flag(entry.main, name === MAIN_APP),
        url: read.maybeText(run?.url) ?? read.maybeText(entry.url),
        interface: read.maybeText(entry.build),
        server: read.maybeText(entry.backend),
        cause: read.clean(entry.cause),
        pending: read.maybeFlag(entry.pending),
        serving: run != null ? read.flag(run.ready) : undefined,
      })
    })
    const worker = read.recordOrNull(structured.worker)

    return read.compact({
      projectId: read.project(structured, args),
      local: read.flag(structured.local),
      recorded: read.flag(structured.recorded),
      apps: presented,
      worker: worker != null ? read.text(worker.phase, 'reported') : undefined,
      restarted: read.maybeText(structured.restarted) ?? (read.maybeText(structured.app) != null ? read.text(structured.app) : undefined),
    })
  })

  return { apps }
}

export const appsPresentHelper = createAppsPresentHelper()
