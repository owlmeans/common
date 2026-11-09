import { toolHostHelper } from '../host.js'
import { instructionsHelper } from '../instructions.js'
import { makeToolProfileModel } from '../profile.js'
import { LISTING_HIDDEN } from './consts.js'
import { LISTING_INSTRUCTION_RULES, LISTING_PREFACE, LISTING_SPLITS, LOCAL_PLUGIN_PREFACE } from './listing/consts.local.js'
import { listingPresentation } from './listing/presentation.js'
import { makeListingTextHelper } from './listing/text.js'
import type { ListingProfileOptions, ToolProfile } from './types.js'

/**
 * A listing profile — what a store listing or a vendor plugin offers: never the tools in
 * {@link LISTING_HIDDEN} (plus `opts.hidden`), the splits and presentation it is given, the client
 * reported by `session_status`, every text it answers said the listing's way (`opts.text`, else the
 * listing's rewrite over its splits), and — unless it brings its own — the base instructions without
 * the recommendation, naming only the tools it offers and opening with `opts.preface` when given.
 */
export const makeListingProfile = (opts: ListingProfileOptions): ToolProfile => {
  const splits = opts.splits ?? []
  const text = opts.text ?? makeListingTextHelper(splits).rewrite

  const profile: ToolProfile = {
    name: opts.name,
    hidden: Object.freeze([...LISTING_HIDDEN, ...(opts.hidden ?? [])]),
    splits,
    presentation: opts.presentation ?? {},
    instructions: opts.instructions ?? (({ host, offered }) => {
      const { namesOf } = makeToolProfileModel(profile)
      const base = instructionsHelper.compose(host, {
        namesOf: tool => namesOf(tool).filter(name => offered.includes(name)),
        recommend: false,
      })
      // The preface stands in for the base text's opening paragraph — everything after it stays.
      const opened = opts.preface != null ? `${opts.preface(host)}${base.slice(base.indexOf('\n\n'))}` : base

      return text(LISTING_INSTRUCTION_RULES.reduce((said, rule) => said.replace(rule.pattern, rule.replace), opened))
    }),
    reportClient: opts.reportClient ?? true,
    text,
  }

  return profile
}

/** The hosted listing (a cloud target). */
export const listingProfile = makeListingProfile({
  name: 'listing',
  splits: LISTING_SPLITS,
  presentation: listingPresentation,
  preface: () => LISTING_PREFACE,
})

/** The listing as the Claude endpoint offers it. */
export const claudeListingProfile = makeListingProfile({
  name: 'listing-claude',
  splits: LISTING_SPLITS,
  presentation: listingPresentation,
  preface: () => LISTING_PREFACE,
})

/** The listing as the OpenAI endpoint offers it. */
export const openaiListingProfile = makeListingProfile({
  name: 'listing-openai',
  splits: LISTING_SPLITS,
  presentation: listingPresentation,
  preface: () => LISTING_PREFACE,
})

/** The stdio plugins' profile (a local target): the listing, and the workspace the project is written into. */
export const localPluginProfile = makeListingProfile({
  name: 'local-plugin',
  splits: LISTING_SPLITS,
  presentation: listingPresentation,
  preface: host => toolHostHelper.localTarget(host) ? `${LISTING_PREFACE}\n\n${LOCAL_PLUGIN_PREFACE}` : LISTING_PREFACE,
})
