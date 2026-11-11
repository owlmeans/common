import { workPresenters } from '../work/presenters.js'
import { presentReadHelper as read } from './read.js'
import type { MaterialsPresentHelper } from './types.js'

export const createMaterialsPresentHelper = (): MaterialsPresentHelper => {
  const outcome = (value: Record<string, unknown>) => read.compact({
    path: read.text(value.path),
    status: read.text(value.status, 'unknown'),
    reason: read.maybeText(value.reason),
    from: read.maybeText(value.from),
  })

  // A created project always carries its status: the status presenter's own refusal is a defect.
  const created: MaterialsPresentHelper['created'] = (structured, args) => {
    const result = read.record(structured)

    return {
      ...workPresenters.projectStatus(result, args),
      files: read.records(result.files).map(outcome),
      pending: read.flag(result.pending),
      sealed: read.flag(result.sealed),
    }
  }

  const catalogue = read.total((structured, args) => read.compact({
    projectId: read.project(structured, args),
    state: read.textOrNull(structured.state),
    files: read.count(structured.files),
    rejected: read.count(structured.rejected),
    lastError: read.warning(structured.lastError),
    entries: read.records(structured.entries).map(entry => read.compact({
      path: read.text(entry.path),
      name: read.text(entry.name),
      size: read.count(entry.size),
      status: read.text(entry.status, 'unknown'),
      kind: read.maybeText(entry.kind),
      purpose: read.maybeText(entry.purpose),
      description: read.maybeText(entry.description),
      reason: read.maybeText(entry.reason),
      placedAt: read.maybeText(entry.placedAt),
      from: read.maybeText(entry.from),
    })),
  }))

  const text = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    path: read.text(structured.path, read.text(args.path)),
    source: read.textOrNull(structured.source),
    length: read.count(structured.length),
    truncated: read.flag(structured.truncated),
  }))

  return { created, catalogue, text }
}

export const materialsPresentHelper = createMaterialsPresentHelper()
