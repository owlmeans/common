import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LAYOUT_MARKERS, LAYOUTS, TARGET_WEB_PORT, TargetLayout } from '@owlmeans/viable-common'
import { makeTargetEnvHelper } from '../src/executor/env.js'

describe('viable-sdk — local browser environment', () => {
  const roots: string[] = []

  const sandbox = async (layout: TargetLayout, webEnv: string): Promise<string> => {
    const root = await mkdtemp(path.join(tmpdir(), 'viable-sdk-env-'))
    roots.push(root)
    const marker = path.join(root, LAYOUT_MARKERS.find(([kind]) => kind === layout)![1])
    await mkdir(marker, { recursive: true })
    const web = path.join(root, LAYOUTS[layout].dir, LAYOUTS[layout].web)
    await mkdir(web, { recursive: true })
    await writeFile(path.join(web, '.env'), webEnv)
    await writeFile(path.join(root, '.env'), 'DATABASE_URL=backend-only\nOIDC_SECRET=backend-only\nAPP_UNSECURE=false\n')
    return root
  }

  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  })

  for (const layout of [TargetLayout.V1, TargetLayout.V2]) {
    test(`${layout}: defaults to the HTTP web proxy without exposing backend secrets`, async () => {
      const root = await sandbox(layout, '')
      const env = await makeTargetEnvHelper(root).frontendEnv()

      expect(env.APP_UNSECURE).toBe('true')
      expect(env.FRONTEND_ENV_KEYS.split(',')).toContain('APP_UNSECURE')
      expect(env.BACKEND_PORT).toBe(String(TARGET_WEB_PORT))
      expect(env.FRONTEND_PORT).toBe(String(TARGET_WEB_PORT))
      expect(env.DATABASE_URL).toBeUndefined()
      expect(env.OIDC_SECRET).toBeUndefined()
    })

    test(`${layout}: preserves the web environment's explicit overrides`, async () => {
      const root = await sandbox(layout, 'APP_UNSECURE=false\nBACKEND_PORT=7443\n')
      const env = await makeTargetEnvHelper(root).frontendEnv()

      expect(env.APP_UNSECURE).toBe('false')
      expect(env.BACKEND_PORT).toBe('7443')
    })
  }
})
