import fs from 'fs-extra'
import p from 'node:path'

import { SubProject, type ConfigurePayload, type ConfigureResult, type ConnectServices } from '@owlmeans/viable-common'

import { confineToProject } from '../executor/files.js'
import { makeLayoutHelper } from '../executor/layout.js'
import { REQUIRED_ENV_KEYS, ROOT_ENV_FILE } from './consts.js'
import { dotenvHelper } from './dotenv.js'
import { probeHelper } from './probe.js'
import type { TargetEnv } from './types.js'
import type { ProjectEnvHelper } from './env/types.js'

/**
 * The target's `.env` files — the one thing about a local project the platform does not own.
 *
 * A slot's configuration is pushed into a pod and the pod's environment is the platform's to
 * compose. On a developer's machine the same values live in a file the developer also writes: the
 * database URL is theirs (nothing provisions a database on a laptop), and so is anything else
 * they added. So a configure push rewrites only what it wrote last time — the block between the
 * two markers — and every line outside it survives untouched.
 */
export const makeProjectEnvHelper = (dir: string): ProjectEnvHelper => {
  const webEnvFile = (): string => {
    const layout = makeLayoutHelper(dir)

    return `${layout.targetPaths().dir}/${layout.subprojectDir(SubProject.Web)}/${ROOT_ENV_FILE}`
  }

  const envFilePaths = (): string[] => [ROOT_ENV_FILE, webEnvFile()]

  const readEnvFile = async (file: string): Promise<Record<string, string>> => {
    const content = await fs.readFile(confineToProject(dir, file), 'utf-8').catch(() => null)

    return content == null ? {} : dotenvHelper.parseEnv(content)
  }

  const readEnv = async (): Promise<TargetEnv> => {
    const files: Record<string, Record<string, string>> = {}
    let values: Record<string, string> = {}
    for (const file of envFilePaths()) {
      const parsed = await readEnvFile(file)
      files[file] = parsed
      values = { ...values, ...parsed }
    }

    return { files, values }
  }

  /**
   * What this machine actually provides.
   *
   * Reported, never assumed — the platform provisions nothing here, so the only honest answer comes
   * from a connect attempt. A service the caller did not ask about stays `false` rather than
   * becoming an unrequested round trip.
   */
  const probeServices = async (
    values: Record<string, string>, probe?: Array<keyof ConnectServices>
  ): Promise<ConnectServices> => {
    const wanted = new Set(probe ?? [])

    return {
      db: wanted.has('db') ? await probeHelper.probeUrl(values.DATABASE_URL) : false,
      valkey: wanted.has('valkey') ? await probeHelper.probeUrl(values.VALKEY_URL) : false,
    }
  }

  const writeEnv = async (payload: ConfigurePayload): Promise<ConfigureResult> => {
    const written: string[] = []

    for (const file of payload.files ?? []) {
      const path = confineToProject(dir, file.path)
      const existing = await fs.readFile(path, 'utf-8').catch(() => '')
      const next = dotenvHelper.replaceManagedBlock(existing, dotenvHelper.yieldToUser(existing, file.content ?? ''))
      if (next !== existing) {
        await fs.ensureDir(p.dirname(path))
        await fs.writeFile(path, next)
      }
      written.push(file.path)
    }

    const { values } = await readEnv()

    return {
      written,
      missing: REQUIRED_ENV_KEYS.filter(key => (values[key] ?? '') === ''),
      services: await probeServices(values, payload.probe),
    }
  }

  const envStatus = async (
    probe: Array<keyof ConnectServices> = ['db', 'valkey']
  ): Promise<ConfigureResult> => {
    const { values } = await readEnv()

    return {
      written: [],
      missing: REQUIRED_ENV_KEYS.filter(key => (values[key] ?? '') === ''),
      services: await probeServices(values, probe),
    }
  }

  return { webEnvFile, envFilePaths, readEnvFile, readEnv, writeEnv, envStatus }
}
