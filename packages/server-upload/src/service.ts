import { randomUUID } from 'node:crypto'
import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { archiveHelper, createWorkspace, fileInspector, transferHelper } from '@owlmeans/file-streams'
import { logger } from '@owlmeans/log'
import { fileScopeHelper } from '@owlmeans/storage-common'
import {
  UploadedFileStatus, UploadLimitError, UploadRequestError, UploadSessionNotFoundError, UploadSessionStateError,
  UploadSessionStatus, uploadPolicyHelper,
} from '@owlmeans/upload'
import type { UploadPolicy } from '@owlmeans/upload'
import { DEFAULT_UPLOAD_WORKSPACE_ROOT, UPLOAD_SERVICE } from './consts.js'
import { makeUploadIntake } from './service/intake.js'
import type { UploadOpenInput, UploadService, UploadServiceOptions } from './service/types.js'
import type { UploadSessionState } from './types.js'

const log = logger('server-upload')

export const createUploadService = (options: UploadServiceOptions): UploadService => {
  const alias = options.alias ?? UPLOAD_SERVICE
  const base: UploadPolicy = uploadPolicyHelper.normalize(options.policy)
  const store = options.sessions
  const receiver = options.receiver
  const intake = makeUploadIntake({
    store, receiver,
    workspace: options.workspace ?? createWorkspace({ root: DEFAULT_UPLOAD_WORKSPACE_ROOT }),
    inspector: options.inspector ?? fileInspector,
    archives: options.archives ?? archiveHelper,
    transfer: options.transfer ?? transferHelper,
  })

  const load = async (id: string): Promise<UploadSessionState | null> => await store.get(id)

  const get = async (id: string): Promise<UploadSessionState> => {
    const state = await store.get(id)
    if (state == null) {
      throw new UploadSessionNotFoundError(id)
    }
    return state
  }

  /** A session narrows the service policy, never widens it. */
  const policyOf = (narrowed: Partial<UploadPolicy> = {}): UploadPolicy => {
    const policy = uploadPolicyHelper.normalize({ ...base, ...narrowed })
    return {
      ...policy,
      maxFiles: Math.min(policy.maxFiles, base.maxFiles),
      maxFileBytes: Math.min(policy.maxFileBytes, base.maxFileBytes),
      maxTotalBytes: Math.min(policy.maxTotalBytes, base.maxTotalBytes),
      refuse: [...new Set([...base.refuse, ...policy.refuse])],
    }
  }

  const open = async (input: UploadOpenInput): Promise<UploadSessionState> => {
    const id = input.id ?? randomUUID()
    if (!fileScopeHelper.isSegment(id)) {
      throw new UploadRequestError('session-id')
    }
    fileScopeHelper.assert(input.scope)
    const policy = policyOf(input.policy)
    if (input.expect != null && !uploadPolicyHelper.fits(policy, { files: 0, bytes: 0 }, input.expect)) {
      throw new UploadLimitError(`expect:${input.expect.files}:${input.expect.bytes}`)
    }
    const now = new Date().toISOString()
    const created = await store.create({
      id, status: UploadSessionStatus.Open, policy, files: [], totals: { files: 0, bytes: 0 }, createdAt: now, updatedAt: now,
      scope: { ...input.scope }, ...(input.owner != null ? { owner: input.owner } : {}),
      reserved: { files: 0, bytes: 0 }, pending: [], refs: {},
    })
    if (created != null) {
      log.debug('Upload session opened', { session: id })
      return created
    }
    const existing = await store.get(id)
    if (existing != null && existing.owner === input.owner) {
      return existing
    }

    throw new UploadSessionStateError('exists')
  }

  const receive: UploadService['receive'] = async (id, incoming) => {
    const state = await get(id)
    if (state.status !== UploadSessionStatus.Open) {
      throw new UploadSessionStateError(state.status)
    }

    return await intake.receive(state, incoming)
  }

  const remove: UploadService['remove'] = async (id, fileId) => {
    const state = await get(id)
    if (state.status !== UploadSessionStatus.Open) {
      throw new UploadSessionStateError(state.status)
    }
    const file = state.files.find(known => known.id === fileId)
    if (file?.status === UploadedFileStatus.Accepted) {
      await receiver.remove?.(state, file, state.refs[fileId])
    }
    const discarded = await store.discard(id, fileId)
    if (discarded == null) {
      throw new UploadSessionNotFoundError(id)
    }

    return discarded.state
  }

  /** open → `to`, idempotent for a session already there, refused from the other end state. */
  const close = async (id: string, to: UploadSessionStatus): Promise<UploadSessionState | null> => {
    const state = await get(id)
    if (state.status === to) {
      return null
    }
    const moved = state.status === UploadSessionStatus.Open
      ? await store.status(id, to, [UploadSessionStatus.Open])
      : null
    if (moved != null) {
      return moved
    }
    const now = await get(id)
    if (now.status === to) {
      return null
    }

    throw new UploadSessionStateError(now.status)
  }

  const seal: UploadService['seal'] = async id => {
    const sealed = await close(id, UploadSessionStatus.Sealed)
    if (sealed == null) {
      return await get(id)
    }
    await intake.clean(sealed)
    await receiver.seal?.(sealed)
    log.info('Upload session sealed', { session: id, files: sealed.totals.files, bytes: sealed.totals.bytes }, { event: 'upload.sealed' })

    return sealed
  }

  const abort: UploadService['abort'] = async id => {
    const aborted = await close(id, UploadSessionStatus.Aborted)
    if (aborted == null) {
      return await get(id)
    }
    await intake.clean(aborted)
    await receiver.abort?.(aborted)
    log.info('Upload session aborted', { session: id, files: aborted.totals.files }, { event: 'upload.aborted' })

    return aborted
  }

  return createService<UploadService>(alias, {
    policy: () => base, open, get, load, receive, remove, seal, abort,
  })
}

/** Registers the upload service on a context and answers it — the object `makeUploadHandlers` binds. */
export const appendUploadService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T, options: UploadServiceOptions,
): UploadService => {
  const service = createUploadService(options)
  ctx.registerService(service)

  return service
}
