import type { BotConnection, BotConnectionInput, BotPlatform } from '@owlmeans/bot'
import type { BotOutcome } from '../../types.js'

export interface ConnectionItemProps {
  connection: BotConnection
  onVerify: (id: string) => Promise<BotOutcome<BotConnection>>
  onToggle: (connection: BotConnection) => Promise<BotOutcome<BotConnection>>
  onEdit: (connection: BotConnection) => void
  onRemove: (connection: BotConnection) => void
}

export interface ConnectionFormProps {
  open: boolean
  /** The connection being changed; a new one when null. */
  editing: BotConnection | null
  platforms: BotPlatform[]
  allowMock: boolean
  onSave: (input: BotConnectionInput) => Promise<BotOutcome<BotConnection>>
  onClose: () => void
}

export interface ConnectionSetupProps {
  connection: BotConnection
}

export interface PlatformHintProps {
  platform: BotPlatform
  /** The Discord application id, when known — the invite link is drawn from it. */
  applicationId?: string | null
  /**
   * Drawn in the connect form, before anything is saved: a platform set up by hand has no address
   * to paste yet, so it is told where the address will appear instead.
   */
  beforeSave?: boolean
}
