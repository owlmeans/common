import { DEFAULT_SKILL_ORDER, PromptBlock, type SkillDefinition } from '@owlmeans/llm-common'
import type { Manifest, ManifestEntry } from '../types.js'
import type { ManifestHelper } from './manifest/types.js'
import { BANNER } from './consts.local.js'

export const createManifestHelper = (): ManifestHelper => {
  const unscoped = (packageName: string): string =>
    packageName.slice(packageName.indexOf('/') + 1)

  const parseManifest = (raw: string): Manifest | null => {
    try {
      const manifest = JSON.parse(raw) as Manifest
      if (typeof manifest.schemaVersion !== 'number' || !Array.isArray(manifest.entries)) {
        return null
      }
      return manifest
    } catch {
      return null
    }
  }

  const stripMeta = (content: string): string => {
    let body = content.replace(/^﻿/, '')
    if (body.startsWith('---')) {
      const end = body.indexOf('\n---', 3)
      if (end >= 0) {
        const after = body.indexOf('\n', end + 1)
        body = after >= 0 ? body.slice(after + 1) : ''
      }
    }

    return body.replace(BANNER, '').trim()
  }

  const skillEntries = (
    manifest: Manifest,
    categories: readonly string[],
  ): ManifestEntry[] =>
    manifest.entries
      .filter(entry => entry.kind === 'skill' && categories.includes(entry.category))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  const toSkill = (
    packageName: string,
    entry: ManifestEntry,
    body: string,
  ): SkillDefinition => ({
    alias: `${packageName}#${entry.name}`,
    title: `${packageName} — ${entry.name}`,
    body,
    block: PromptBlock.Packages,
    order: DEFAULT_SKILL_ORDER + 1,
  })

  return { unscoped, parseManifest, stripMeta, skillEntries, toSkill }
}

export const manifestHelper = createManifestHelper()
