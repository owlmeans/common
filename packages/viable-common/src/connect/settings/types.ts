import type { ConnectLlm } from '../consts.js'

/** The per-profile connector preference. */
export interface ConnectProfileSettings {
  llmMode: ConnectLlm
}

export interface ConnectProfileSettingsView extends ConnectProfileSettings {
  /** Whether the organization's plan allows the local-LLM mode at all. */
  canUseLocal: boolean
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
}

export interface ConnectProjectLlmBody {
  llmMode: ConnectLlm | null
}
