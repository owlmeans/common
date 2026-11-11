import { resolve } from 'node:path'
import type { UploadInput, UploadInputResult } from '@owlmeans/client-upload'
import { uploadPathHelper } from '@owlmeans/client-upload/node'
import { uploadPolicyHelper } from '@owlmeans/upload'
import { MATERIALS_UPLOAD_POLICY, ConnectMaterialTextSource, MATERIAL_USABLE_STATUSES } from '@owlmeans/viable-common'
import {
  MATERIAL_DESCRIPTION_CUT, MATERIAL_OUTCOME_LABELS, MATERIAL_OUTCOME_ORDER, MATERIAL_REASON_PHRASES, MATERIALS_STATE_PHRASES,
  MATERIALS_UPLOAD_CONCURRENCY,
} from './consts.local.js'
import { refusalHelper } from './refusal.js'
import type { MaterialOutcome, MaterialsToolHelper } from './materials/types.js'

export const createMaterialsToolHelper = (): MaterialsToolHelper => {
  const reasonPhrase: MaterialsToolHelper['reasonPhrase'] = reason => MATERIAL_REASON_PHRASES[reason] ?? reason

  const inputsOf: MaterialsToolHelper['inputsOf'] = async (paths, base) => {
    const inputs: UploadInput[] = []
    const unreadable: MaterialOutcome[] = []
    for (const given of paths) {
      try {
        // A folder is named by its own name, a file by its name — wherever on this machine it lives.
        const found = await uploadPathHelper.fromPaths([resolve(base ?? process.cwd(), given)])
        if (found.length === 0) {
          unreadable.push({ path: given, status: 'unreadable', reason: 'empty' })
        }
        inputs.push(...found)
      } catch {
        unreadable.push({ path: given, status: 'unreadable', reason: 'unreadable' })
      }
    }

    return { inputs, unreadable }
  }

  const precheck: MaterialsToolHelper['precheck'] = inputs => {
    const checked = uploadPolicyHelper.precheck(
      inputs.map(input => ({ path: input.path, size: input.size ?? 0 })), MATERIALS_UPLOAD_POLICY,
    )

    return {
      admitted: checked.accepted.map(accepted => ({ ...inputs[accepted.index]!, path: accepted.path })),
      refused: checked.refused.map(refused => ({ path: refused.path, status: 'refused', reason: refused.reason, size: refused.size })),
      totals: { files: checked.totals.files, bytes: checked.totals.bytes },
    }
  }

  /** What the platform answered for one input — a file, an archive's files, a refusal or a failure. */
  const outcomesOf = (result: UploadInputResult, input: UploadInput | undefined): MaterialOutcome[] => {
    if (result.refused != null) {
      return [{ path: result.path, status: 'refused', reason: result.refused, ...(input?.size != null ? { size: input.size } : {}) }]
    }
    if (result.files.length > 0) {
      return result.files.map(file => ({
        path: file.path,
        status: file.status === 'accepted' ? 'accepted' : 'rejected',
        ...(file.reason != null ? { reason: file.reason } : {}),
        ...(file.from != null ? { from: file.from } : {}),
        size: file.size,
      }))
    }

    return [{
      path: result.path, status: 'failed',
      reason: result.error != null ? refusalHelper.refusalMessage(result.error) : `status:${result.status ?? 'none'}`,
      ...(input?.size != null ? { size: input.size } : {}),
    }]
  }

  const send: MaterialsToolHelper['send'] = async (deps, projectId, inputs) => {
    let files: MaterialOutcome[]
    try {
      const results = await deps.api.materials.upload(projectId, inputs, { concurrency: MATERIALS_UPLOAD_CONCURRENCY })
      files = results.flatMap(result => outcomesOf(result, inputs[result.index]))
    } catch (e) {
      // The session read before the first file failed: nothing was sent.
      deps.log(`materials upload of ${projectId} failed: ${refusalHelper.refusalMessage(e)}`)
      files = inputs.map(input => ({
        path: input.path, status: 'failed', reason: refusalHelper.refusalMessage(e),
        ...(input.size != null ? { size: input.size } : {}),
      }))
    }

    // Sealed whatever arrived: an upload left open is a project that waits for files nobody sends.
    try {
      await deps.api.materials.seal(projectId)

      return { files, sealed: true }
    } catch (sealError) {
      deps.log(`materials seal of ${projectId} refused: ${refusalHelper.refusalMessage(sealError)} — drafting with what arrived`)
      try {
        await deps.api.materials.draft(projectId, true)

        return { files, sealed: true }
      } catch (draftError) {
        deps.log(`materials draft of ${projectId} refused: ${refusalHelper.refusalMessage(draftError)}`)

        return { files, sealed: false, error: refusalHelper.refusalPhrase(draftError) }
      }
    }
  }

  const renderOutcomes: MaterialsToolHelper['renderOutcomes'] = outcomes => {
    if (outcomes.length === 0) return 'files: none'
    const counts = MATERIAL_OUTCOME_ORDER
      .map(status => [status, outcomes.filter(outcome => outcome.status === status).length] as const)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `${count} ${MATERIAL_OUTCOME_LABELS[status]}`)
    const lines = [...outcomes].sort((a, b) => MATERIAL_OUTCOME_ORDER.indexOf(a.status) - MATERIAL_OUTCOME_ORDER.indexOf(b.status))
      .map(outcome => `  ${outcome.status.padEnd(10)} ${outcome.path}`
        + (outcome.from != null ? ` (from ${outcome.from})` : '')
        + (outcome.reason != null && outcome.status !== 'accepted' ? ` — ${reasonPhrase(outcome.reason)}` : ''))

    return [`files: ${counts.join(', ')}`, ...lines].join('\n')
  }

  const renderCatalogue: MaterialsToolHelper['renderCatalogue'] = (projectId, catalogue) => {
    if (catalogue.entries.length === 0 && catalogue.state == null) {
      return `Project ${projectId} was created without files.`
    }
    const usable = catalogue.entries.filter(entry => MATERIAL_USABLE_STATUSES.includes(entry.status))
    const lines = [
      `files of ${projectId}: ${usable.length} usable${catalogue.rejected > 0 ? `, ${catalogue.rejected} rejected` : ''}`
      + `${catalogue.state != null ? ` · ${catalogue.state}` : ''}`,
      ...catalogue.entries.map(entry => {
        const description = entry.description != null && entry.description !== ''
          ? ` — ${entry.description.length > MATERIAL_DESCRIPTION_CUT ? `${entry.description.slice(0, MATERIAL_DESCRIPTION_CUT - 1)}…` : entry.description}`
          : ''

        return `  ${entry.path} · ${entry.purpose ?? 'not classified yet'} · ${entry.status}`
          + (entry.reason != null ? ` (${reasonPhrase(entry.reason)})` : '')
          + (entry.placedAt != null ? ` · at ${entry.placedAt}` : '')
          + description
      }),
    ]
    if (catalogue.state != null) {
      lines.push(`state: ${MATERIALS_STATE_PHRASES[catalogue.state] ?? catalogue.state}`)
    }
    if (catalogue.lastError != null && catalogue.lastError !== '') {
      lines.push(`error: ${refusalHelper.refusalPhrase(catalogue.lastError)}`)
    }
    const first = usable[0]
    lines.push(first != null
      ? `next: read_material ${JSON.stringify({ projectId, path: first.path })} reads a file's text`
      : 'next: nothing here to read — every file was refused or removed')

    return lines.join('\n')
  }

  const renderText: MaterialsToolHelper['renderText'] = text => {
    if (text.source == null) {
      return `${text.path} carries no text the platform can read — an image, a font or media the analysis`
        + ' wrote no transcript of. list_materials describes it.'
    }
    const notes = [
      ...(text.source === ConnectMaterialTextSource.Transcript ? ['the platform\'s markdown transcript of the document'] : []),
      ...(text.truncated === true ? [`the first ${text.text.length} of ${text.length} characters`] : []),
    ]

    return notes.length > 0 ? `${text.text}\n\n[${text.path}: ${notes.join('; ')}]` : text.text
  }

  return { inputsOf, precheck, send, renderOutcomes, renderCatalogue, renderText, reasonPhrase }
}

export const materialsToolHelper = createMaterialsToolHelper()
