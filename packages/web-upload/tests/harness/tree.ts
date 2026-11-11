import { makeUploadProtocols } from '@owlmeans/upload'

/** The one service the harness server runs and the browser calls. */
export const HARNESS_SERVER = 'web-upload-server'

export const MiB = 1024 * 1024

/** What the harness server accepts — and what the browser's queue is told unless a spec says otherwise. */
export const HARNESS_POLICY = { maxFiles: 20, maxFileBytes: 4 * MiB, maxTotalBytes: 16 * MiB }

/** The upload tree, shared by the server (bun) and the browser harness. Guest: the session id is the capability. */
export const harnessTree = makeUploadProtocols({ alias: 'web-upload-test', path: '/uploads', maxFileBytes: HARNESS_POLICY.maxFileBytes })
