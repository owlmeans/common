import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { WorkloadReader, WorkloadWriter } from '../../src/index.js'

export interface LocalWorkload {
  readonly url: string
  /** The sandbox the writes land in. */
  readonly sandbox: string
  /** Answer the next `count` commands with a 500. */
  failNext: (count: number) => void
  /** Commands received. */
  commands: number
  stop: () => void
}

/**
 * A stand-in for a Viable publisher's `POST /command/`: the `writeBinaryFile` contract with its real
 * limits — base64 of at most 16 MiB characters, a 20 MiB body, a path confined to the sandbox, an
 * atomic temp-and-rename write — and its read twin `readBinaryFile { filePath } → { base64 }`.
 */
export const startWorkload = (sandbox: string): LocalWorkload => {
  let failures = 0
  const state = { commands: 0 }
  // The publisher's check: the alphabet with trailing padding over a length divisible by four.
  const isBase64 = (value: string): boolean => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  const confined = (filePath: string): string | null => {
    const target = resolve(sandbox, filePath.replace(/^\/var\/sandbox\/?/, ''))
    const inside = relative(sandbox, target)
    return inside === '' || inside.startsWith('..') ? null : target
  }

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    maxRequestBodySize: 20 * 1024 * 1024,
    fetch: async request => {
      const url = new URL(request.url)
      if (request.method !== 'POST' || url.pathname !== '/command/') {
        return new Response('not found', { status: 404 })
      }
      state.commands++
      if (failures > 0) {
        failures--
        return new Response('busy', { status: 500 })
      }
      const payload = await request.json() as { type: string, command: string, args?: { filePath?: unknown, base64?: unknown } }
      const filePath = payload.args?.filePath
      const data = payload.args?.base64
      if (payload.type === 'files' && payload.command === 'readBinaryFile') {
        const target = typeof filePath === 'string' ? confined(filePath) : null
        if (target == null) {
          return Response.json({ error: 'outside sandbox' }, { status: 400 })
        }
        const stats = await stat(target).catch(() => null)
        if (stats == null || !stats.isFile()) {
          return Response.json({ error: 'not found' }, { status: 404 })
        }
        return Response.json({ base64: (await readFile(target)).toString('base64') })
      }
      if (payload.type !== 'files' || payload.command !== 'writeBinaryFile' || typeof filePath !== 'string'
        || typeof data !== 'string' || data.length > 16 * 1024 * 1024 || !isBase64(data)) {
        return Response.json({ error: 'Invalid binary media payload' }, { status: 400 })
      }
      const target = confined(filePath)
      if (target == null) {
        return Response.json({ error: 'outside sandbox' }, { status: 400 })
      }
      await mkdir(dirname(target), { recursive: true })
      const temporary = `${target}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, Buffer.from(data, 'base64'), { flag: 'wx' })
        await rename(temporary, target)
      } finally {
        await rm(temporary, { force: true })
      }
      return Response.json({})
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}/command/`,
    sandbox,
    failNext: count => { failures = count },
    get commands () { return state.commands },
    set commands (value: number) { state.commands = value },
    stop: () => { server.stop(true) },
  }
}

/** The agent side of the contract: what viable-agent's FileHelper does, over plain fetch. */
export const workloadWriter = (url: string): WorkloadWriter => ({
  writeBinaryFile: async (filePath: string, base64: string): Promise<void> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'files', command: 'writeBinaryFile', args: { filePath, base64 } }),
    })
    if (!response.ok) {
      throw new Error(`workload answered ${response.status}`)
    }
  },
})

/** The agent side of the read: what viable-agent's FileHelper does, over plain fetch. */
export const workloadReader = (url: string): WorkloadReader => ({
  readBinaryFile: async (filePath: string): Promise<string> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'files', command: 'readBinaryFile', args: { filePath } }),
    })
    if (!response.ok) {
      throw new Error(`workload answered ${response.status}`)
    }
    return (await response.json() as { base64: string }).base64
  },
})
