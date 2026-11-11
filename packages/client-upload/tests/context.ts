import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo, Server } from 'node:net'
import { appendApiClient } from '@owlmeans/api'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { bindAll } from '@owlmeans/client-entrypoint'
import { AppType } from '@owlmeans/context'
import { createDirectorySink, createWorkspace } from '@owlmeans/file-streams'
import { appendApiServer } from '@owlmeans/server-api'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { appendUploadService, createResourceSessionStore, makeUploadHandlers, treeReceiver } from '@owlmeans/server-upload'
import type { StoredUploadSession, UploadReceiver, UploadService } from '@owlmeans/server-upload'
import { createStaticResource } from '@owlmeans/static-resource'
import { makeUploadProtocols } from '@owlmeans/upload'
import type { UploadProtocols } from '@owlmeans/upload'
import { makeUploadClient } from '../src/index.js'
import type { UploadClient } from '../src/index.js'

/** The part of the API server a spec drives: listen on a free port, close. */
interface Listening {
  listen: (options: { port: number, host: string }) => Promise<unknown>
  close: () => Promise<unknown>
  server: Server
}

export const MiB = 1024 * 1024

export interface ClientHarness {
  base: string
  delivered: string
  service: UploadService
  tree: UploadProtocols
  client: ClientContext<ClientConfig>
  uploads: UploadClient
  /** Paths whose first delivery failed on purpose (a receiver that fails once under `flaky/`). */
  failed: string[]
  close: () => Promise<void>
}

/**
 * A real server-upload service over HTTP (guest tree, tree receiver into a folder; its receiver fails
 * the first delivery of every `flaky/` path, as a busy downstream would) and a client context calling it
 * through the client under test.
 */
export const makeClientHarness = async (label: string): Promise<ClientHarness> => {
  const base = mkdtempSync(join(tmpdir(), `client-upload-${label}-`))
  const delivered = join(base, 'delivered')
  const serviceName = `client-upload-server-${label}`
  const tree = makeUploadProtocols({ alias: `client-upload-${label}`, path: '/uploads', maxFileBytes: 4 * MiB })
  const failed: string[] = []
  const inner = treeReceiver(session => createDirectorySink(join(delivered, session.id), { onConflict: 'overwrite' }))
  const receiver: UploadReceiver = {
    receive: async (session, file, source) => {
      if (file.path.startsWith('flaky/') && !failed.includes(file.path)) {
        failed.push(file.path)
        throw new Error('downstream busy')
      }
      return await inner.receive(session, file, source)
    },
  }

  const context = makeServerContext(config<ServerConfig>(serviceName, {
    services: { [serviceName]: { service: serviceName, type: AppType.Backend, host: '127.0.0.1', default: true } },
  } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
  appendApiServer(context)
  const service = appendUploadService(context, {
    alias: `upload-${label}`,
    policy: { maxFileBytes: 4 * MiB, maxTotalBytes: 16 * MiB, maxFiles: 20 },
    sessions: createResourceSessionStore(createStaticResource<StoredUploadSession>(`upload-${label}`, `upload-${randomUUID()}`)),
    receiver,
    workspace: createWorkspace({ root: join(base, 'workspace') }),
  })
  context.registerEntrypoints(makeUploadHandlers(service, {
    scopeOf: (_request, session) => ({ organization: 'guests', purpose: `upload-${session.id}` }),
  }).serve(tree))
  context.configure()
  await context.init()
  const server = (context as ServerContext<ServerConfig> & { getApiServer: () => { server: Listening } }).getApiServer().server
  await server.listen({ port: 0, host: '127.0.0.1' })
  const port = (server.server.address() as AddressInfo).port

  const client = makeClientContext({
    service: `client-upload-${label}`, type: AppType.Backend, layer: undefined, ready: false,
    services: { [serviceName]: { service: serviceName, type: AppType.Backend, host: '127.0.0.1', port, default: true } },
    security: { unsecure: true },
  } as unknown as ClientConfig) as ClientContext<ClientConfig>
  appendApiClient(client)
  client.registerEntrypoints(bindAll(tree))
  client.configure()
  await client.init()

  return {
    base, delivered, service, tree, client, uploads: makeUploadClient(client, tree), failed,
    close: async () => {
      await server.close()
      rmSync(base, { recursive: true, force: true })
    },
  }
}
