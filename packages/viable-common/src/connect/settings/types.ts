import type { ConnectLlm } from '../consts.js'

/** The per-profile connector preference. */
export interface ConnectProfileSettings {
  llmMode: ConnectLlm
}

export interface ConnectProfileSettingsView extends ConnectProfileSettings {
  /** Whether the organization's plan allows the local-LLM mode at all. */
  canUseLocal: boolean
  /**
   * The profile's preference for who performs a CONVERSION's model calls.
   *
   * Its own setting rather than a reading of `llmMode`, because the two answer for different
   * work: a conversion reads somebody else's whole repository, which is the one case where handing
   * the inference to the parent agent is the cheap default rather than the experimental option.
   *
   * OPTIONAL: the two converter fields are answered by a platform build that does not exist yet,
   * and this package is consumed by the platform through a workspace link rather than a published
   * range — a required field here is a compile error in every handler that already returns this
   * view. Tightened to required once the platform's conversion handlers fill them.
   */
  converterLlmMode?: ConnectLlm
  /** Whether this caller may run a conversion's model calls on the parent agent. */
  canUseConverterLocal?: boolean
}

export interface ConnectLlmBody {
  llmMode: ConnectLlm
}

/** The per-project override, and what it resolves to. */
export interface ConnectProjectSettings {
  /** `null` means "inherit the profile setting". */
  llmMode: ConnectLlm | null
  effective: ConnectLlm
  canUseLocal: boolean
  /**
   * The project's converter override; `null` inherits the profile's.
   *
   * Optional on the same forward-compatibility grounds as
   * {@link ConnectProfileSettingsView.converterLlmMode} — absent from an answer written before the
   * platform's conversion handlers land, and never to be read as a value.
   */
  converterLlmMode?: ConnectLlm | null
  /** What the override, the profile and the platform's own floor actually resolve to. */
  converterEffective?: ConnectLlm
}

export interface ConnectProjectLlmBody {
  llmMode: ConnectLlm | null
}
