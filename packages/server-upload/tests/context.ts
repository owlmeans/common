import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import type { AddressInfo, Server } from 'node:net'
import { appendApiClient } from '@owlmeans/api'
import { authMiddleware, makeEntityScope } from '@owlmeans/auth-common'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { bind as bindClient } from '@owlmeans/client-entrypoint'
import { AppType } from '@owlmeans/context'
import { protocols as flatten } from '@owlmeans/entrypoint'
import { createDirectorySink, createWorkspace, WORKSPACE_SCOPE_MARKER } from '@owlmeans/file-streams'
import type { Workspace } from '@owlmeans/file-streams'
import { addLogPlugin, memoryPlugin, removeLogPlugin } from '@owlmeans/log'
import type { MemoryPlugin } from '@owlmeans/log'
import { appendApiServer } from '@owlmeans/server-api'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { createStaticResource } from '@owlmeans/static-resource'
import { makeMockGuard, USER } from '@owlmeans/test-auth'
import { makeUploadProtocols } from '@owlmeans/upload'
import type { UploadPolicy, UploadProtocols } from '@owlmeans/upload'
import {
  appendUploadService, createResourceSessionStore, forwardingReceiver, makeUploadHandlers, treeReceiver,
} from '../src/index.js'
import type { StoredUploadSession, UploadService, UploadSessionState } from '../src/index.js'

/** The part of the API server a spec drives: listen on a free port, close. */
interface Listening {
  listen: (options: { port: number, host: string }) => Promise<unknown>
  close: () => Promise<unknown>
  server: Server
}

export const MiB = 1024 * 1024
export const ORG_A = 'org-a'
export const ORG_B = 'org-b'

const TOKEN_A = 'Bearer upload-org-a'
const TOKEN_B = 'Bearer upload-org-b'

export interface HarnessSide {
  context: ServerContext<ServerConfig>
  server: Listening
  port: number
}

export interface Harness {
  /** The workspace root files are spooled under (A). */
  root: string
  workspace: Workspace
  /** Where A's tree receiver writes, `<delivered>/<session>/<path>`. */
  delivered: string
  /** Where B's tree receiver writes the forwarded files. */
  forwarded: string
  /** A's main service (trees `orgA`, `orgB`) and its forwarding service (tree `forward`). */
  service: UploadService
  forward: UploadService
  /** B's service (tree `remote`, no unpacking). */
  remote: UploadService
  a: HarnessSide
  b: HarnessSide
  trees: { orgA: UploadProtocols, orgB: UploadProtocols, forward: UploadProtocols, remote: UploadProtocols }
  client: ClientContext<ClientConfig>
  memory: MemoryPlugin
  /** Opens a session of org A server-side, as an application keyed by its own id would. */
  open: (policy?: Partial<UploadPolicy>, id?: string) => Promise<UploadSessionState>
  /** Every regular file under a folder, relative, sorted. */
  files: (dir: string) => string[]
  /** What is spooled in the workspace now — the scope markers left out. */
  spooled: () => string[]
  close: () => Promise<void>
}

const listFiles = (dir: string): string[] => {
  const found: string[] = []
  const walk = (folder: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(folder)
    } catch {
      return
    }
    for (const name of entries) {
      const path = join(folder, name)
      if (statSync(path).isDirectory()) walk(path)
      else found.push(relative(dir, path).split('\\').join('/'))
    }
  }
  walk(dir)
  return found.sort()
}

const listen = async (context: ServerContext<ServerConfig>): Promise<HarnessSide> => {
  const server = (context as ServerContext<ServerConfig> & { getApiServer: () => { server: Listening } }).getApiServer().server
  await server.listen({ port: 0, host: '127.0.0.1' })
  return { context, server, port: (server.server.address() as AddressInfo).port }
}

/**
 * Two real server contexts over HTTP and a client context calling them: A serves org A's and org B's
 * trees over one service (tree receiver into a folder) and a forwarding service whose receiver streams
 * every accepted file to B; B serves a guest tree over its own service (tree receiver, no unpacking).
 */
export const makeHarness = async (label: string, policy: Partial<UploadPolicy> = {}): Promise<Harness> => {
  const memory = memoryPlugin(`server-upload-${label}`)
  addLogPlugin(memory)
  const base = mkdtempSync(join(tmpdir(), `server-upload-${label}-`))
  const root = join(base, 'workspace')
  const delivered = join(base, 'delivered')
  const forwarded = join(base, 'forwarded')
  const workspace = createWorkspace({ root })
  const suffix = randomUUID().slice(0, 8)
  const serviceA = `upload-a-${label}`
  const serviceB = `upload-b-${label}`

  const trees = {
    orgA: makeUploadProtocols({ alias: `${label}-a`, path: '/a/uploads', guards: `${label}-guard-a`, maxFileBytes: MiB }),
    orgB: makeUploadProtocols({ alias: `${label}-b`, path: '/b/uploads', guards: `${label}-guard-b`, maxFileBytes: MiB }),
    forward: makeUploadProtocols({
      alias: `${label}-fwd`, path: '/fwd/uploads', sessionParam: 'project', guards: `${label}-guard-a`, maxFileBytes: MiB,
    }),
    remote: makeUploadProtocols({ alias: `${label}-remote`, path: '/remote/uploads', service: serviceB, maxFileBytes: MiB }),
  }
  const scopeOf = (request: Parameters<typeof makeEntityScope>[0], session: { id: string }) => ({
    organization: makeEntityScope(request).entityKeyOf() ?? 'guest', purpose: `upload-${session.id}`,
  })

  // B — the receiving service.
  const contextB = makeServerContext(config<ServerConfig>(serviceB, {
    services: { [serviceB]: { service: serviceB, type: AppType.Backend, host: '127.0.0.1', default: true } },
  } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
  appendApiServer(contextB)
  const remote = appendUploadService(contextB, {
    alias: `upload-remote-${label}`,
    policy: { ...policy, unpackArchives: false },
    sessions: createResourceSessionStore(createStaticResource<StoredUploadSession>(`upload-remote-${label}`, `upload-remote-${suffix}`)),
    receiver: treeReceiver(session => createDirectorySink(join(forwarded, session.id), { onConflict: 'overwrite' })),
    workspace: createWorkspace({ root: join(base, 'workspace-b') }),
  })
  contextB.registerEntrypoints(makeUploadHandlers(remote, { scopeOf }).serve(trees.remote))
  contextB.configure()
  await contextB.init()
  const b = await listen(contextB)

  // A — the service the client talks to.
  const contextA = makeServerContext(config<ServerConfig>(serviceA, {
    services: {
      [serviceA]: { service: serviceA, type: AppType.Backend, host: '127.0.0.1', default: true },
      [serviceB]: { service: serviceB, type: AppType.Backend, host: '127.0.0.1', internalHost: '127.0.0.1', port: b.port },
    },
    security: { unsecure: true },
  } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
  appendApiServer(contextA)
  appendApiClient(contextA)
  contextA.registerService(makeMockGuard({
    alias: `${label}-guard-a`, auth: { ...USER, entitySlug: ORG_A }, allow: request => request.headers?.authorization === TOKEN_A,
  }))
  contextA.registerService(makeMockGuard({
    alias: `${label}-guard-b`, auth: { ...USER, userId: 'user-2', entitySlug: ORG_B }, allow: request => request.headers?.authorization === TOKEN_B,
  }))
  const service = appendUploadService(contextA, {
    alias: `upload-${label}`,
    policy,
    sessions: createResourceSessionStore(createStaticResource<StoredUploadSession>(`upload-${label}`, `upload-${suffix}`)),
    receiver: treeReceiver(session => createDirectorySink(join(delivered, session.id), { onConflict: 'overwrite' }), {
      remove: async (_session, _file, ref) => { if (ref != null) await rm(ref, { force: true }) },
    }),
    workspace,
  })
  const forward = appendUploadService(contextA, {
    alias: `upload-forward-${label}`,
    policy,
    sessions: createResourceSessionStore(createStaticResource<StoredUploadSession>(`upload-forward-${label}`, `upload-forward-${suffix}`)),
    receiver: forwardingReceiver(contextA, trees.remote, { paramsOf: session => ({ session: session.id }) }),
    workspace,
  })
  const handlers = makeUploadHandlers(service, { scopeOf })
  contextA.registerEntrypoints(handlers.serve(trees.orgA))
  contextA.registerEntrypoints(handlers.serve(trees.orgB))
  contextA.registerEntrypoints(makeUploadHandlers(forward, { scopeOf }).serve(trees.forward))
  contextA.registerEntrypoints(flatten(trees.remote).map(declaration => bindClient(declaration)))
  contextA.configure()
  await contextA.init()
  const a = await listen(contextA)

  // The client — a browser or a Bun process.
  const client = makeClientContext({
    service: `upload-client-${label}`, type: AppType.Backend, layer: undefined, ready: false,
    services: { [serviceA]: { service: serviceA, type: AppType.Backend, host: '127.0.0.1', port: a.port, default: true } },
    security: { unsecure: true },
  } as unknown as ClientConfig) as ClientContext<ClientConfig>
  appendApiClient(client)
  client.registerService(makeMockGuard({ alias: `${label}-guard-a`, token: TOKEN_A }))
  client.registerService(makeMockGuard({ alias: `${label}-guard-b`, token: TOKEN_B }))
  client.registerMiddleware(authMiddleware)
  for (const tree of [trees.orgA, trees.orgB, trees.forward]) {
    client.registerEntrypoints(flatten(tree).map(declaration => bindClient(declaration, { validateOnCall: true })))
  }
  client.configure()
  await client.init()

  const open = async (narrowed: Partial<UploadPolicy> = {}, id: string = randomUUID()): Promise<UploadSessionState> =>
    await service.open({ id, owner: ORG_A, scope: { organization: ORG_A, purpose: `upload-${id}` }, policy: narrowed })

  const close = async (): Promise<void> => {
    removeLogPlugin(memory.name)
    await a.server.close()
    await b.server.close()
    rmSync(base, { recursive: true, force: true })
  }

  return {
    root, workspace, delivered, forwarded, service, forward, remote, a, b, trees, client, memory, open, files: listFiles, close,
    spooled: () => listFiles(root).filter(path => !path.endsWith(`/${WORKSPACE_SCOPE_MARKER}`)),
  }
}

/** A Node stream of `total` bytes in `chunk`-sized pieces, sent chunked (no length). */
export const chunked = async function * (total: number, chunk: number, pause = 0, onChunk?: (sent: number) => void): AsyncGenerator<Buffer> {
  for (let sent = 0; sent < total; sent += chunk) {
    yield Buffer.alloc(Math.min(chunk, total - sent), 0x61)
    onChunk?.(sent + chunk)
    if (pause > 0) await new Promise(resolve => setTimeout(resolve, pause))
  }
}

export const until = async (check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> => {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not reached')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
