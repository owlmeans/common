import {
  LANDING_ANCHOR_BAND, LANDING_ANCHOR_LABELS, LANDING_ANCHORS, LANDING_BAND_ORDER, LANDING_CONTRAST,
  LANDING_MENU, LANDING_PRINCIPLES, LANDING_USE_CASES,
} from './consts.js'
import type { GuestHomePlan, LandingAnchor, LandingBand, LandingMenuEntry, LandingSlot } from './types.js'
import type { LandingPlanHelper } from './landing/types.js'

const filled = (value: string | null | undefined): boolean => (value?.trim() ?? '') !== ''

export const createLandingPlanHelper = (): LandingPlanHelper => {
  /** The use cases a page draws: titled ones, at most {@link LANDING_USE_CASES}.max. */
  const drawnUseCases = (home: GuestHomePlan) =>
    (home.useCases?.cases ?? []).filter(entry => filled(entry.title)).slice(0, LANDING_USE_CASES.max)

  /** The closing link cards a page draws: titled ones, at most two. */
  const drawnClosingLinks = (home: GuestHomePlan) =>
    (home.closing?.links ?? []).filter(entry => filled(entry.title)).slice(0, 2)

  /** Whether the gate is drawn: a gate is a form, and one without fields is no gate at all. */
  const usableGate = (home: GuestHomePlan): boolean =>
    home.gate != null && (home.gate.fields ?? []).length > 0

  /** One presence rule per band — see {@link LandingPlanHelper.landingBandsOf}. */
  const bandPresent: Record<LandingBand, (home: GuestHomePlan) => boolean> = {
    hero: () => true,
    steps: home => (home.steps ?? []).some(step => filled(step.title)),
    features: () => true,
    'use-cases': home => drawnUseCases(home).length >= LANDING_USE_CASES.min,
    problem: () => true,
    differentiator: home => {
      const band = home.differentiator
      if (band == null) return false
      const rows = (band.contrast ?? []).filter(row => filled(row.usual) && filled(row.ours))

      return rows.length >= LANDING_CONTRAST.min || (filled(band.title) && filled(band.text))
    },
    approach: home =>
      (home.approach?.principles ?? []).filter(entry => filled(entry.title)).length >= LANDING_PRINCIPLES.min,
    testimonials: home => (home.testimonials ?? []).filter(entry => filled(entry.quote)).length >= 2,
    about: home => home.about != null && filled(home.about.title) && filled(home.about.text),
    closing: home => home.closing != null,
  }

  const landingBandsOf: LandingPlanHelper['landingBandsOf'] = home =>
    LANDING_BAND_ORDER.filter(band => bandPresent[band](home))

  /** The page's own section label for an anchor's band, when the plan wrote one. */
  const sectionLabel = (home: GuestHomePlan, anchor: LandingAnchor): string | null | undefined => {
    const labels = home.labels ?? {}
    switch (anchor) {
      case 'how': return labels.steps
      case 'features': return labels.features
      case 'use-cases': return labels.useCases
      case 'why': return labels.differentiator
      case 'approach': return labels.approach
      case 'community': return labels.testimonials
      case 'about': return labels.about
    }
  }

  const landingMenuOf: LandingPlanHelper['landingMenuOf'] = (home, max = LANDING_MENU.max) => {
    const bands = landingBandsOf(home)
    const drawn = (anchor: LandingAnchor) =>
      LANDING_ANCHORS.includes(anchor) && bands.includes(LANDING_ANCHOR_BAND[anchor])
    const order = (anchor: LandingAnchor) => LANDING_ANCHORS.indexOf(anchor)
    const label = (anchor: LandingAnchor, own?: string | null): string => {
      const candidates = [own, sectionLabel(home, anchor)]
      const chosen = candidates.find(filled)

      return chosen?.trim() ?? LANDING_ANCHOR_LABELS[anchor]
    }

    const chosen: LandingMenuEntry[] = []
    for (const entry of home.menu ?? []) {
      if (entry == null || !drawn(entry.anchor) || chosen.some(kept => kept.anchor === entry.anchor)) {
        continue
      }
      chosen.push({ anchor: entry.anchor, label: label(entry.anchor, entry.label) })
    }
    chosen.sort((a, b) => order(a.anchor) - order(b.anchor))
    chosen.splice(Math.max(LANDING_MENU.min, max))

    const padding: LandingAnchor[] = ['how', 'features', ...LANDING_ANCHORS.filter(
      anchor => anchor !== 'how' && anchor !== 'features'
    )]
    for (const anchor of padding) {
      if (chosen.length >= LANDING_MENU.min) break
      if (drawn(anchor) && !chosen.some(kept => kept.anchor === anchor)) {
        chosen.push({ anchor, label: label(anchor) })
      }
    }

    return chosen.sort((a, b) => order(a.anchor) - order(b.anchor))
  }

  const homeSlotsOf: LandingPlanHelper['homeSlotsOf'] = home => {
    const gate = usableGate(home)
    const slots: LandingSlot[] = []

    if (!gate) slots.push('hero.cta')
    if (!gate && filled(home.hero.secondary?.label)) slots.push('hero.secondary')
    if (filled(home.hero.browse?.label)) slots.push('hero.browse')

    if (bandPresent['use-cases'](home)) {
      drawnUseCases(home).forEach((_, index) => slots.push(`useCase.${index + 1}` as LandingSlot))
    }

    if (home.closing != null) {
      if (!gate) slots.push('closing.primary')
      if (filled(home.closing.secondary?.label)) slots.push('closing.secondary')
      drawnClosingLinks(home).forEach((_, index) => slots.push(`closing.link.${index + 1}` as LandingSlot))
    }

    return slots
  }

  return { landingBandsOf, landingMenuOf, homeSlotsOf }
}

export const landingPlanHelper = createLandingPlanHelper()
