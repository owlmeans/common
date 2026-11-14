import {
  MATERIAL_LINK_SLUG_MAX, MATERIAL_SKILL_NAME_MAX, MATERIALS_DIR, MATERIALS_LINKS_PREFIX, MATERIALS_REFERENCE_DESIGN,
  MATERIALS_REFERENCE_DIR, MATERIALS_REFERENCE_SUMMARY, MATERIALS_RESEARCH_DIR, MATERIALS_SKILL_FILE, MATERIALS_SKILL_PREFIX,
  MATERIALS_SKILLS_DIR, MATERIALS_WORKLOAD_SKILLS_DIR,
} from './consts.js'
import type { MaterialPathHelper } from './paths/types.js'

/** Lower-case `[a-z0-9-]`, single hyphens, none at either end, at most `max` characters. */
const segmentOf = (text: string, max: number): string => text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, max).replace(/-+$/, '')

/** Whether a relative path is `dir` or lies under it, case-insensitive. */
const under = (path: string, dir: string): boolean => {
  const lower = path.replace(/\\/g, '/').replace(/^(\.?\/)+/, '').toLowerCase()

  return lower === dir || lower.startsWith(`${dir}/`)
}

export const createMaterialPathHelper = (): MaterialPathHelper => {
  const fallbackSkill = 'package'

  const isLinkPath = (path: string): boolean => under(path, MATERIALS_LINKS_PREFIX)

  const isReservedPath = (path: string): boolean => under(path, MATERIALS_DIR.toLowerCase()) || isLinkPath(path)

  const slugOf = (text: string): string => {
    let source = text.trim()
    try {
      const url = new URL(source)
      if (url.host !== '') source = `${url.host.replace(/^www\./i, '')}${url.pathname}`
    } catch {
      // Not a URL: the text itself.
    }

    return segmentOf(source, MATERIAL_LINK_SLUG_MAX) || 'link'
  }

  const folderNameOf = (ordinal: number, slug: string): string => {
    const number = Number.isFinite(ordinal) ? Math.max(0, Math.trunc(ordinal)) : 0

    return `${String(number).padStart(2, '0')}-${slugOf(slug)}`
  }

  const folderOf = (ordinal: number, slug: string): string => `${MATERIALS_LINKS_PREFIX}/${folderNameOf(ordinal, slug)}`

  const skillNameOf = (packageName: string): string | null =>
    segmentOf(packageName, MATERIAL_SKILL_NAME_MAX - MATERIALS_SKILL_PREFIX.length) || null

  const skillOf = (name: string): string => skillNameOf(name) ?? fallbackSkill

  const researchDocOf = (slug: string): string => `${MATERIALS_DIR}/${MATERIALS_RESEARCH_DIR}/${slugOf(slug)}.md`

  const summaryDocOf = (slug: string): string =>
    `${MATERIALS_DIR}/${MATERIALS_REFERENCE_DIR}/${slugOf(slug)}/${MATERIALS_REFERENCE_SUMMARY}`

  const designDocOf = (slug: string): string =>
    `${MATERIALS_DIR}/${MATERIALS_REFERENCE_DIR}/${slugOf(slug)}/${MATERIALS_REFERENCE_DESIGN}`

  const skillDocOf = (name: string): string => `${MATERIALS_DIR}/${MATERIALS_SKILLS_DIR}/${skillOf(name)}/${MATERIALS_SKILL_FILE}`

  const skillDirOf = (name: string): string => `${MATERIALS_WORKLOAD_SKILLS_DIR}/${MATERIALS_SKILL_PREFIX}${skillOf(name)}`

  return {
    isLinkPath, isReservedPath, slugOf, folderNameOf, folderOf, skillNameOf, researchDocOf, summaryDocOf, designDocOf,
    skillDocOf, skillDirOf,
  }
}

export const materialPathHelper = createMaterialPathHelper()
