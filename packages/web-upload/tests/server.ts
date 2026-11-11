import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo, Server } from 'node:net'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { bindAll } from '@owlmeans/client-entrypoint'
import { makeUploadClient } from '@owlmeans/client-upload'
import type { UploadClient } from '@owlmeans/client-upload'
import { AppType } from '@owlmeans/context'
import { createDirectorySink, createWorkspace } from '@owlmeans/file-streams'
import { appendApiServer } from '@owlmeans/server-api'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { appendUploadService, createResourceSessionStore, makeUploadHandlers, treeReceiver } from '@owlmeans/server-upload'
import type { StoredUploadSession, UploadService } from '@owlmeans/server-upload'
import { createStaticResource } from '@owlmeans/static-resource'
import { HARNESS_POLICY, HARNESS_SERVER, harnessTree } from './harness/tree.js'

/** The part of the API server a spec drives: listen on a free port, close. */
interface Listening {
  listen: (options: { port: number, host: string }) => Promise<unknown>
  close: () => Promise<unknown>
  server: Server
}

export interface UploadServer {
  port: number
  /** Where accepted files land: `<delivered>/<session>/<path>`. */
  delivered: string
  service: UploadService
  /** The upload client in this bun process, over HTTP. */
  uploads: UploadClient
  close: () => Promise<void>
}

const start = async (): Promise<UploadServer> => {
  const base = mkdtempSync(join(tmpdir(), 'web-upload-'))
  const delivered = join(base, 'delivered')
  const context = makeServerContext(config<ServerConfig>(HARNESS_SERVER, {
    services: { [HARNESS_SERVER]: { service: HARNESS_SERVER, type: AppType.Backend, host: '127.0.0.1', default: true } },
  } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
  appendApiServer(context)
  const service = appendUploadService(context, {
    policy: HARNESS_POLICY,
    sessions: createResourceSessionStore(createStaticResource<StoredUploadSession>('web-upload-sessions', `web-upload-${randomUUID()}`)),
    receiver: treeReceiver(session => createDirectorySink(join(delivered, session.id), { onConflict: 'overwrite' })),
    workspace: createWorkspace({ root: join(base, 'workspace') }),
  })
  context.registerEntrypoints(makeUploadHandlers(service, {
    scopeOf: (_request, session) => ({ organization: 'guests', purpose: `upload-${session.id}` }),
  }).serve(harnessTree))
  context.configure()
  await context.init()
  const server = (context as ServerContext<ServerConfig> & { getApiServer: () => { server: Listening } }).getApiServer().server
  await server.listen({ port: 0, host: '127.0.0.1' })
  const port = (server.server.address() as AddressInfo).port

  const client = makeClientContext({
    service: 'web-upload-bun', type: AppType.Backend, layer: undefined, ready: false,
    services: { [HARNESS_SERVER]: { service: HARNESS_SERVER, type: AppType.Backend, host: '127.0.0.1', port, default: true } },
    security: { unsecure: true },
  } as unknown as ClientConfig) as ClientContext<ClientConfig>
  client.registerEntrypoints(bindAll(harnessTree))
  client.configure()
  await client.init()

  return {
    port, delivered, service, uploads: makeUploadClient(client, harnessTree),
    close: async () => {
      await server.close()
      rmSync(base, { recursive: true, force: true })
    },
  }
}

let shared: Promise<UploadServer> | null = null

/** One upload server per `bun test` process, shared by every spec that needs it. */
export const uploadServer = async (): Promise<UploadServer> => await (shared ??= start())

export const closeUploadServer = async (): Promise<void> => {
  const running = shared
  shared = null
  await (await running)?.close()
}
