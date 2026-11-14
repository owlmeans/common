import { RESEARCH_RUNS_DIR } from '../consts.js'
import type { ResearchSources } from '../store/types.js'
import { textUtils } from '../utils/text.js'
import type { RunArea, SourceRecord } from './area/types.js'

export const makeRunArea = (sources: ResearchSources, runId: string): RunArea => {
  const prefix = [RESEARCH_RUNS_DIR, ...runId.split('/').filter(part => part !== '').map(textUtils.segment)].join('/')

  const path: RunArea['path'] = (...parts) => [prefix, ...parts].join('/')

  const files: RunArea['files'] = id => path('files', textUtils.segment(id))

  const read: RunArea['read'] = async <T>(rel: string) => {
    const text = await sources.read(path(rel))
    if (text == null) return null
    try {
      return JSON.parse(text) as T
    } catch {
      return null
    }
  }

  const write: RunArea['write'] = async (rel, value) => sources.put(path(rel), JSON.stringify(value, null, 2))

  const unitPath = (id: string): string => `units/${textUtils.segment(id)}.json`

  const units: RunArea['units'] = async () => {
    const found = await sources.list(path('units'))
    const records = await Promise.all(found.filter(file => file.endsWith('.json')).map(async file => {
      const text = await sources.read(file)
      try {
        return text != null ? JSON.parse(text) as SourceRecord : null
      } catch {
        return null
      }
    }))
    return records.filter((record): record is SourceRecord => record != null).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }

  return {
    prefix,
    path,
    files,
    read,
    write,
    step: async <T>(step: string) => read<T>(`steps/${step}.json`),
    saveStep: async (step, value) => write(`steps/${step}.json`, value),
    unit: async id => read<SourceRecord>(unitPath(id)),
    saveUnit: async record => write(unitPath(record.id), record),
    units,
    dropFiles: async id => sources.remove(files(id)),
    clear: async () => sources.remove(prefix),
  }
}
