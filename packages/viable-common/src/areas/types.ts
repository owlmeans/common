import type { ProjectArea } from './consts.js'

/**
 * A user story as the analysis stage produces it: the narrative, plus the area whose
 * audience acts in it.
 *
 * The area is structured data rather than a phrase inside the sentence because everything
 * downstream keys off it — which entrypoint the story's screens hang under, what access they
 * inherit, and which URL the preview opens when the story is done.
 */
export interface StoryDraft {
  story: string
  area: ProjectArea
}

/**
 * One line of the generated application's navigation.
 *
 * A screen reaches the menus through exactly one of these. `section` groups entries into the
 * top menu; it is a label, never a URL segment — the address of a screen is its entrypoint
 * path and nothing else.
 */
export interface NavEntry {
  area: ProjectArea
  section: string
  /** The screen's `app.web.*` alias. */
  alias: string
  label: string
}
