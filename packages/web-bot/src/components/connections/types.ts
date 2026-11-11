import type { BotConnection, BotConnectionInput, BotPlatformDescriptor, BotPlatformId } from '@owlmeans/bot'
import type { BotOutcome } from '../../types.js'

export interface ConnectionItemProps {
  connection: BotConnection
  /** The descriptor of the connection's platform — null while the platforms are read, or with no plugin. */
  descriptor: BotPlatformDescriptor | null
  /** The server's registered platform ids, for reading a stored refusal. */
  platforms: readonly BotPlatformId[]
  onVerify: (id: string) => Promise<BotOutcome<BotConnection>>
  onToggle: (connection: BotConnection) => Promise<BotOutcome<BotConnection>>
  onEdit: (connection: BotConnection) => void
  onRemove: (connection: BotConnection) => void
}

export interface ConnectionFormProps {
  open: boolean
  /** The connection being changed; a new one when null. */
  editing: BotConnection | null
  /** What a NEW connection may be made on, in the server's order. */
  platforms: BotPlatformDescriptor[]
  /** Every registered descriptor — an edited connection's platform is looked up here. */
  descriptors: BotPlatformDescriptor[]
  onSave: (input: BotConnectionInput) => Promise<BotOutcome<BotConnection>>
  onClose: () => void
}

export interface ConnectionSetupProps {
  connection: BotConnection
  descriptor: BotPlatformDescriptor | null
}

export interface PlatformHintProps {
  descriptor: BotPlatformDescriptor
  /** The credentials typed so far — the descriptor's pre-save link is filled from them. */
  values?: Readonly<Record<string, string | undefined>>
  /** The verified bot account's id, when known — a link param marked `identity` falls back to it. */
  identity?: string | null
  /**
   * Drawn in the connect form, before anything is saved: a platform set up by hand has no address
   * to paste yet, so it is told where the address will appear instead.
   */
  beforeSave?: boolean
}
