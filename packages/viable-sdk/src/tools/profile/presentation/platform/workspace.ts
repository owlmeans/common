import { SOURCES_KIND } from '../../../consts.local.js'
import { presentReadHelper as read } from './read.js'
import type { WorkspacePresentHelper } from './types.js'

export const createWorkspacePresentHelper = (): WorkspacePresentHelper => {
  const files = read.total((structured, args) => {
    const paths = read.texts(structured.files)

    return read.compact({
      projectId: read.project(structured, args),
      // The sources branch names no kind of its own: it is the default one.
      kind: read.maybeText(structured.kind) ?? read.maybeText(args.kind) ?? SOURCES_KIND,
      category: read.maybeText(structured.category),
      total: read.count(structured.total, paths.length),
      files: paths,
    })
  })

  const file = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    path: read.text(structured.path, read.text(args.path)),
    length: read.count(structured.length),
    truncated: read.flag(structured.truncated),
  }))

  const written = read.total((structured, args) => {
    const buildWarning = read.warning(structured.buildWarning)

    return read.compact({
      projectId: read.project(structured, args),
      path: read.text(structured.path, read.text(args.path)),
      previewRebuilt: buildWarning == null,
      buildWarning,
    })
  })

  const preview = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    preview: read.workload(structured.slot),
  }))

  return { files, file, written, preview }
}

export const workspacePresentHelper = createWorkspacePresentHelper()
