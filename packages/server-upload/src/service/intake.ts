import { createHash, randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import { logger } from '@owlmeans/log'
import {
  createStreamSource, DEFAULT_PROBE_BYTES, FileKind, FileKindError, FileMimicryError, LimitError,
} from '@owlmeans/file-streams'
import type {
  ArchiveFormat, ExtractResult, FileSource, FileVerdict, TransferResult, TreeSink, WorkspaceScope,
} from '@owlmeans/file-streams'
import {
  UploadedFileStatus, UploadError, UploadReason, UploadRejectedError, UploadSessionNotFoundError, UploadSessionStateError,
  UploadSessionStatus, uploadPolicyHelper,
} from '@owlmeans/upload'
import type { UploadedFile } from '@owlmeans/upload'
import {
  UPLOAD_ARCHIVE_ENTRIES_PER_FILE, UPLOAD_ARCHIVE_ENTRY_MARGIN, UPLOAD_REJECTED_RECORDS, UPLOAD_SPOOL_FOLDER,
  UPLOAD_UNPACK_FOLDER,
} from '../consts.js'
import type { UploadReserveOutcome, UploadSessionState } from '../types.js'
import { makeHeldReservation } from './held.js'
import type { UploadIncoming } from './types.js'
import type {
  HeldReservation, UploadIntake, UploadIntakeDeps, UploadIntakeFile, UploadVerification,
} from './types.local.js'

const log = logger('server-upload:intake')

/** A tree whose entries land under `prefix` of another one. */
const prefixedTree = (tree: TreeSink, prefix: string): TreeSink => ({
  kind: tree.kind,
  entry: path => tree.entry(`${prefix}/${path}`),
  directory: async (path, options) => await tree.directory(`${prefix}/${path}`, options),
})

/** A failure of the machine (disk full, permissions) rather than of the archive. */
const isSystemFailure = (error: unknown): boolean =>
  typeof (error as { code?: unknown } | null)?.code === 'string' && /^E[A-Z]+$/.test((error as { code: string }).code)

export const makeUploadIntake = (deps: UploadIntakeDeps): UploadIntake => {
  const { store, receiver, workspace, inspector, archives, transfer } = deps

  const spoolOf = (state: UploadSessionState, fileId: string): string => `${UPLOAD_SPOOL_FOLDER}/${state.id}/${fileId}`
  const unpackOf = (state: UploadSessionState, fileId: string): string => `${UPLOAD_UNPACK_FOLDER}/${state.id}/${fileId}`

  const quietly = async (work: () => Promise<unknown>): Promise<void> => {
    try {
      await work()
    } catch (error) {
      log.warn('Upload cleanup failed', { error })
    }
  }

  /** A path refused by the rules, shown safely. */
  const shownFile = (raw: string, from?: string): UploadIntakeFile => {
    const path = uploadPolicyHelper.display(raw) || '_'
    return { id: randomUUID(), path, name: posix.basename(path) || path, ...(from != null ? { from } : {}) }
  }

  const typeOf = (verdict: FileVerdict, declared?: string): Pick<UploadedFile, 'mime' | 'kind'> => {
    const mime = verdict.detected?.mime ?? inspector.normalizeMime(declared) ?? verdict.declared.extMime
    const kind = verdict.detected?.kind ?? verdict.declared.kinds[0]
    return { ...(mime != null ? { mime } : {}), ...(kind != null ? { kind } : {}) }
  }

  const reject = async (
    state: UploadSessionState, file: UploadIntakeFile, size: number, reason: UploadReason, extra: Partial<UploadedFile> = {},
  ): Promise<UploadedFile> => {
    const row: UploadedFile = {
      id: file.id, path: file.path, name: file.name, size, ...extra,
      status: UploadedFileStatus.Rejected, reason, ...(file.from != null ? { from: file.from } : {}),
    }
    const kept = state.files.filter(known => known.status === UploadedFileStatus.Rejected).length
    if (kept < UPLOAD_REJECTED_RECORDS) {
      await store.record(state.id, row)
    }

    return row
  }

  const refuseReservation = async (
    state: UploadSessionState, file: UploadIntakeFile, size: number, outcome: UploadReserveOutcome,
  ): Promise<UploadedFile> => {
    switch (outcome) {
      case 'limits':
        log.debug('Upload over the limits', { session: state.id, size })
        return await reject(state, file, size, UploadReason.Limits)
      case 'duplicate':
        log.debug('Upload path taken', { session: state.id })
        return await reject(state, file, size, UploadReason.Duplicate)
      case 'closed':
        throw new UploadSessionStateError('closed')
      default:
        throw new UploadSessionNotFoundError(state.id)
    }
  }

  /** The complete file probed and held to the policy; a refusal removes it at once and is logged. */
  const verify = async (
    state: UploadSessionState, file: UploadIntakeFile, source: FileSource, size: number, declared: string | undefined,
    discard: () => Promise<unknown>,
  ): Promise<UploadVerification> => {
    const policy = state.policy
    const verdict = await inspector.probe(source, {
      maxBytes: Math.max(policy.maxFileBytes, DEFAULT_PROBE_BYTES),
      claims: { name: file.name, ...(declared != null ? { mime: declared } : {}) },
    })
    try {
      inspector.enforce(verdict, { refuse: policy.refuse, ...(policy.allow != null ? { allow: policy.allow } : {}) })
      return { verdict }
    } catch (error) {
      if (!(error instanceof FileMimicryError) && !(error instanceof FileKindError)) {
        throw error
      }
      await discard()
      const reason = error instanceof FileKindError
        ? UploadReason.RefusedKind
        : verdict.dangerous ? UploadReason.Dangerous : UploadReason.TypeMismatch
      log.error('Upload refused', {
        session: state.id, path: file.path, ...(file.from != null ? { from: file.from } : {}), reason, size,
        declared: { ext: verdict.declared.ext, mime: verdict.declared.mime ?? verdict.declared.extMime, kinds: verdict.declared.kinds },
        detected: verdict.detected != null ? { ext: verdict.detected.ext, mime: verdict.detected.mime, kind: verdict.detected.kind } : null,
        reasons: verdict.reasons, error,
      }, { event: 'upload.refused' })

      return { verdict, reason }
    }
  }

  const accepted = (file: UploadIntakeFile, size: number, verdict: FileVerdict, digest?: string, declared?: string): UploadedFile => ({
    id: file.id, path: file.path, name: file.name, size, ...typeOf(verdict, declared),
    ...(digest != null ? { digest } : {}), status: UploadedFileStatus.Accepted, ...(file.from != null ? { from: file.from } : {}),
  })

  const digestOf = async (source: FileSource, signal?: AbortSignal): Promise<string> => {
    const { stream } = await source.open({ signal })
    const hash = createHash('sha256')
    for await (const chunk of stream) {
      hash.update(chunk as Buffer)
    }
    return hash.digest('hex')
  }

  /** The receiver takes the file, then the session records it — or the session closed meanwhile. */
  const deliver = async (state: UploadSessionState, file: UploadedFile, source: FileSource, hold: HeldReservation): Promise<UploadedFile> => {
    // A session sealed or aborted while the bytes arrived takes nothing more — not even into the receiver.
    if ((await store.get(state.id))?.status !== UploadSessionStatus.Open) {
      await hold.release()
      throw new UploadSessionStateError('closed')
    }
    let ref: string | undefined
    try {
      ref = (await receiver.receive(state, file, source))?.ref
    } catch (error) {
      if (!(error instanceof UploadRejectedError)) {
        throw error
      }
      await hold.release()
      log.warn('Upload refused by its receiver', { session: state.id, path: file.path, reason: error.reason })
      return await reject(state, file, file.size, error.reason, { ...(file.mime != null ? { mime: file.mime } : {}), ...(file.kind != null ? { kind: file.kind } : {}) })
    }
    const recorded = await store.record(state.id, file, ref)
    if (recorded == null) {
      await hold.release()
      await quietly(async () => await receiver.remove?.(state, file, ref))
      throw new UploadSessionStateError('closed')
    }
    hold.consume()

    return file
  }

  /** One unpacked entry, handled like an uploaded file. */
  const entry = async (
    state: UploadSessionState, scope: WorkspaceScope, archive: UploadIntakeFile, path: string, local: string, size: number,
    signal?: AbortSignal,
  ): Promise<UploadedFile> => {
    const discard = async (): Promise<boolean> => await scope.remove(local)
    const checked = uploadPolicyHelper.path(path)
    if (!checked.ok) {
      await quietly(discard)
      return await reject(state, shownFile(path, archive.path), size, UploadReason.PathInvalid)
    }
    const file: UploadIntakeFile = { id: randomUUID(), path: checked.path, name: checked.name, from: archive.path }
    if (size > state.policy.maxFileBytes) {
      await quietly(discard)
      return await reject(state, file, size, UploadReason.Limits)
    }
    const reservation = { files: 1, bytes: size, paths: [checked.path] }
    const outcome = await store.reserve(state.id, reservation)
    if (outcome !== 'reserved') {
      await quietly(discard)
      return await refuseReservation(state, file, size, outcome)
    }
    const hold = makeHeldReservation(store, state.id, reservation)
    try {
      const source = scope.source(local, { name: file.name })
      const checkedType = await verify(state, file, source, size, undefined, discard)
      if (checkedType.reason != null) {
        await hold.release()
        return await reject(state, file, size, checkedType.reason, typeOf(checkedType.verdict))
      }
      return await deliver(state, accepted(file, size, checkedType.verdict, await digestOf(source, signal)), source, hold)
    } finally {
      await hold.release()
      await quietly(discard)
    }
  }

  /** An archive's entries — when its expansion fits what the session still allows. */
  const unpack = async (
    state: UploadSessionState, scope: WorkspaceScope, archive: UploadIntakeFile, source: FileSource, format: ArchiveFormat,
    size: number, signal?: AbortSignal,
  ): Promise<UploadedFile[]> => {
    const current = await store.get(state.id)
    if (current == null) {
      throw new UploadSessionNotFoundError(state.id)
    }
    const left = uploadPolicyHelper.remaining(state.policy, current.reserved)
    if (left.files === 0 || left.bytes === 0) {
      return [await reject(state, archive, size, UploadReason.Limits)]
    }
    const folder = posix.dirname(archive.path)
    const pathOf = (path: string): string => folder === '.' ? path : `${folder}/${path}`
    const target = unpackOf(state, archive.id)

    let extracted: ExtractResult
    try {
      extracted = await archives.extract(source, prefixedTree(scope.tree(), target), {
        format, signal, links: 'skip',
        limits: {
          maxEntries: left.files * UPLOAD_ARCHIVE_ENTRIES_PER_FILE + UPLOAD_ARCHIVE_ENTRY_MARGIN,
          maxEntryBytes: left.bytes, maxTotalBytes: left.bytes, maxDepth: 1,
        },
      })
    } catch (error) {
      await quietly(async () => await scope.remove(target))
      if (signal?.aborted === true || isSystemFailure(error)) {
        throw error
      }
      if (error instanceof LimitError && !error.message.endsWith(':ratio')) {
        log.debug('Upload archive over the limits', { session: state.id, size })
        return [await reject(state, archive, size, UploadReason.Limits)]
      }
      log.error('Upload archive refused', {
        session: state.id, path: archive.path, reason: UploadReason.ArchiveInvalid, size, format, error,
      }, { event: 'upload.refused' })
      return [await reject(state, archive, size, UploadReason.ArchiveInvalid, { kind: FileKind.Archive })]
    }

    const results: UploadedFile[] = []
    try {
      for (const skipped of extracted.skipped) {
        log.debug('Upload archive entry skipped', { session: state.id, why: skipped.reason, type: skipped.entry.type })
        results.push(await reject(state, shownFile(pathOf(skipped.entry.path), archive.path), skipped.entry.size ?? 0, UploadReason.ArchiveInvalid))
      }
      for (const written of extracted.extracted) {
        results.push(await entry(state, scope, archive, pathOf(written.path), `${target}/${written.path}`, written.result.bytes, signal))
      }
    } finally {
      await quietly(async () => await scope.remove(target))
    }

    return results
  }

  const receive = async (state: UploadSessionState, incoming: UploadIncoming): Promise<UploadedFile[]> => {
    const policy = state.policy
    const declared = incoming.length ?? incoming.size ?? 0
    const checked = uploadPolicyHelper.path(incoming.path)
    if (!checked.ok) {
      log.debug('Upload path refused', { session: state.id, issue: checked.issue })
      return [await reject(state, shownFile(incoming.path), declared, UploadReason.PathInvalid)]
    }
    const file: UploadIntakeFile = { id: randomUUID(), path: checked.path, name: checked.name }
    if (declared > policy.maxFileBytes) {
      return [await reject(state, file, declared, UploadReason.Limits)]
    }
    const reservation = { files: 1, bytes: declared, paths: [checked.path] }
    const outcome = await store.reserve(state.id, reservation)
    if (outcome !== 'reserved') {
      return [await refuseReservation(state, file, declared, outcome)]
    }

    const hold = makeHeldReservation(store, state.id, reservation)
    const scope = workspace.scope(state.scope)
    const spool = spoolOf(state, file.id)
    const discard = async (): Promise<boolean> => await scope.remove(spool)
    try {
      let copied: TransferResult
      try {
        copied = await transfer.copy(
          createStreamSource(incoming.stream, { name: file.name, mime: incoming.type, size: incoming.length }), scope.entry(spool),
          { verify: false, hash: 'sha256', limits: { maxBytes: policy.maxFileBytes }, signal: incoming.signal },
        )
      } catch (error) {
        if (error instanceof LimitError && error.message.endsWith(':max-bytes')) {
          await hold.release()
          return [await reject(state, file, declared, UploadReason.Limits)]
        }
        throw error
      }
      const grown = await hold.resize(copied.bytes)
      if (grown !== 'reserved') {
        await quietly(discard)
        await hold.release()
        return [await refuseReservation(state, file, copied.bytes, grown)]
      }

      const source = scope.source(spool, { name: file.name, ...(incoming.type != null ? { mime: incoming.type } : {}) })
      const checkedType = await verify(state, file, source, copied.bytes, incoming.type, discard)
      if (checkedType.reason != null) {
        await hold.release()
        return [await reject(state, file, copied.bytes, checkedType.reason, typeOf(checkedType.verdict, incoming.type))]
      }
      const kind = checkedType.verdict.detected?.kind
      if (policy.unpackArchives && (kind === FileKind.Archive || kind === FileKind.Compressed)) {
        const format = await archives.detect(source).catch(() => null)
        if (format != null) {
          // The archive itself is never handed on: its entries are counted instead.
          await hold.release()
          return await unpack(state, scope, file, source, format, copied.bytes, incoming.signal)
        }
      }

      return [await deliver(state, accepted(file, copied.bytes, checkedType.verdict, copied.sha256, incoming.type), source, hold)]
    } catch (error) {
      // Sealed or aborted while this file was in flight — its spool may be gone under it: answer the state.
      if (!(error instanceof UploadError) && (await store.get(state.id))?.status !== UploadSessionStatus.Open) {
        throw new UploadSessionStateError('closed')
      }
      throw error
    } finally {
      await hold.release()
      await quietly(discard)
    }
  }

  const clean = async (state: UploadSessionState): Promise<void> => {
    const scope = workspace.scope(state.scope)
    await quietly(async () => await scope.remove(`${UPLOAD_SPOOL_FOLDER}/${state.id}`))
    await quietly(async () => await scope.remove(`${UPLOAD_UNPACK_FOLDER}/${state.id}`))
    const left = await scope.list().catch(() => null)
    if (left != null && left.length === 0) {
      await quietly(async () => await scope.drop())
    }
  }

  return { receive, clean }
}
