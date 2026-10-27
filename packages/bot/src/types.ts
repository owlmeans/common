import type {
  BotActionKind, BotChatKind, BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport, BotUpdateKind,
} from './consts.js'

/** One credential a platform needs — what the panel draws an input for. */
export interface BotCredentialField {
  key: string
  /** Never shown back once saved; the connection only says the key holds a value. */
  secret: boolean
  /** The connection cannot be verified without it. */
  required: boolean
  /**
   * The server creates it on save and nobody types it (WhatsApp's verify token); the connection's
   * `setup` steps carry it for pasting into the platform console.
   */
  generated?: boolean
  /** Optional credential only: the platform calls it adds when set (Slack's admin `userToken`: `delete`). */
  enables?: BotActionKind[]
}

/** What a platform needs and can do. One per platform, in `BOT_PLATFORMS`. */
export interface BotPlatformDescriptor {
  platform: BotPlatform
  title: string
  credentials: BotCredentialField[]
  /** The receive modes the platform offers, preferred first. */
  receive: BotReceiveMode[]
  /** The platform calls the required credentials allow; `note` is never listed. */
  actions: BotActionKind[]
  /** `auto`: the server registers the hook itself; `manual`: a person pastes `setup` into the console. */
  setup: 'auto' | 'manual'
  /** Where a person learns to create the bot and its credentials. */
  docs: string
}

/** A connection as any client sees it — never a credential. */
export interface BotConnection {
  id: string
  /** The organization (or application) key the connection belongs to — the server's, never the wire's. */
  scope: string
  platform: BotPlatform
  label: string
  transport: BotTransport
  status: BotConnectionStatus
  enabled: boolean
  /** The receive mode in effect. */
  receive: BotReceiveMode
  /** Who the bot is on the platform, as verification answered. */
  identity?: { id: string, username?: string, name?: string }
  /** The address the platform posts to, for webhook platforms. */
  hookUrl?: string
  /** Manual steps: the URL / verify token to paste in the platform console. */
  setup?: string[]
  /** Which credential keys hold a value. */
  credentialsSet: string[]
  lastError?: string
  lastEventAt?: string
  createdAt: string
  updatedAt: string
}

/**
 * A connection as a client writes it. `credentials` is write-only: an omitted key keeps its stored
 * value.
 */
export interface BotConnectionInput {
  id?: string
  platform: BotPlatform
  label: string
  transport?: BotTransport
  enabled?: boolean
  credentials?: Record<string, string>
}

/** A chat; `space` is the Discord guild or the Slack team. */
export interface BotChatRef {
  id: string
  kind: BotChatKind
  title?: string
  thread?: string
  space?: string
}

export interface BotSenderRef {
  id: string
  name?: string
  username?: string
  bot?: boolean
}

/**
 * Enough to act on one message. `space` (the Discord guild / Slack team) is carried so a reference
 * alone suffices where the platform addresses a member through it (a Discord timeout needs the guild).
 */
export interface BotMessageRef {
  chat: string
  id: string
  thread?: string
  space?: string
}

/** The message an update carries. */
export interface BotReplyTarget extends BotMessageRef {
  text?: string
  sender?: BotSenderRef
}

export interface BotMessage {
  ref: BotMessageRef
  text: string
  date: string
  replyTo?: BotReplyTarget
}

/** A `/command`, its bot address stripped and its name lower-cased. */
export interface BotCommand {
  name: string
  args: string
}

/** A normalized inbound update, as a handler receives it. */
export interface BotUpdate {
  id: string
  connection: string
  scope: string
  platform: BotPlatform
  kind: BotUpdateKind
  chat: BotChatRef
  sender?: BotSenderRef
  message?: BotMessage
  command?: BotCommand
  /** A direct message, a mention of the bot, or a reply to it. */
  addressed: boolean
  receivedAt: string
  raw?: unknown
}

/** Whom an activity acted on. */
export interface BotActivityTarget {
  chat: string
  message?: string
  user?: string
}

/** One thing the bot did — or tried to do — recorded whether it succeeded or not. */
export interface BotActivity {
  id: string
  scope: string
  connection: string
  platform: BotPlatform
  /** The update it answered. */
  update?: string
  action: BotActionKind
  target?: BotActivityTarget
  text?: string
  /**
   * An opaque reference the acting handler passed (`{ ref }` on the action) — e.g. the id of the
   * application's own record it followed, such as the keyword group a message matched. The bot
   * packages never read it.
   */
  ref?: string
  ok: boolean
  /** Why it failed, as a short sentence a person reads. */
  error?: string
  /**
   * The machine marker of the failure (`bot:<marker>:<detail>`) — what code compares and what a
   * translating view keys its copy on; never shown as is.
   */
  code?: string
  transport: BotTransport
  at: string
}

/** A message fed to a MOCK connection through the platform's own path. */
export interface BotSimulateInput {
  text: string
  chat?: Partial<BotChatRef>
  sender?: Partial<BotSenderRef>
  replyTo?: { id: string, text?: string }
}

export interface BotSimulateResult {
  /** The id of the update the simulated message became. */
  update: string
  /**
   * `true` when the simulated payload's dedupe key was already in the inbox: `update` is that
   * existing row and nothing new is dispatched. `false` (or absent) for a new row.
   */
  duplicate?: boolean
}
