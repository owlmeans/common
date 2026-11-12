import type {
  BotActionKind, BotChatKind, BotConnectionStatus, BotReceiveMode, BotTransport, BotUpdateKind,
} from './consts.js'

/**
 * A messaging platform's id — the plugin's own (`BotPlatformDescriptor.platform`), never a closed
 * list of this contract: a deployment supports exactly the platforms it registers. It is a path
 * segment of the hook URL and a stored column, so it matches `BOT_PLATFORM_ID_PATTERN` and never
 * changes once connections exist.
 */
export type BotPlatformId = string

/**
 * One text in every language a panel may render, keyed by language code (`en`, `pl`, `uk` …). A
 * reader's language that is missing falls back to `BOT_TEXT_FALLBACK_LANGUAGE`.
 */
export interface BotTexts {
  [language: string]: string
}

/**
 * The neutral glyph a panel draws beside a platform's name — never a brand mark: `send` a paper
 * plane, `phone` a handset, `messages` speech bubbles, `hash` a channel sign, `chat` one bubble.
 */
export type BotPlatformGlyph = 'send' | 'phone' | 'messages' | 'hash' | 'chat'

/** One credential a platform needs — what the panel draws an input for. */
export interface BotCredentialField {
  key: string
  /** Never shown back once saved; the connection only says the key holds a value. */
  secret: boolean
  /** The connection cannot be verified without it. */
  required: boolean
  /**
   * The server creates it on save and nobody types it (a verify token the platform's console asks
   * for); the connection's `setup` steps carry it for pasting into the platform console.
   */
  generated?: boolean
  /** Optional credential only: the platform calls it adds when set (an admin token adding `delete`). */
  enables?: BotActionKind[]
  /** The input's label, per language. */
  label: BotTexts
  /** One line under the input — where in the platform the value is found — per language. */
  hint?: BotTexts
}

/** One placeholder of a {@link BotPlatformLink} template. */
export interface BotLinkParam {
  /** The credential whose typed value fills `{key}` in the template (URL-encoded). */
  key: string
  /** What the value must match before the link is drawn (`^\d{5,32}$` — an id, never free text). */
  pattern: string
  /**
   * A saved connection never shows a credential back: with `identity`, the verified bot account's
   * id fills the placeholder when no typed value is in hand.
   */
  identity?: boolean
}

/**
 * A link a person follows in the platform itself, drawn before the connection is saved as soon as
 * its placeholders have values — an invite that adds the bot to a server with the rights its actions
 * need. `kind` names what it is for; `invite` is the one kind today.
 */
export interface BotPlatformLink {
  kind: 'invite'
  /** The address, with `{key}` placeholders. */
  template: string
  params: BotLinkParam[]
  /** The link's text, per language. */
  label: BotTexts
  /** What is drawn while a placeholder has no valid value, per language. */
  pending?: BotTexts
}

/**
 * What a platform needs and can do — the one record every layer reads: the panel draws the
 * credential inputs, the glyph, the labels and the hints from it, the server verifies and acts by it,
 * generation picks actions from it. The platform's plugin owns it; the server lists the registered
 * plugins' descriptors on every managing tree (`platform.list`).
 *
 * `actions` lists the platform CALLS a connection can make with its required credentials; an
 * optional credential's `enables` adds more. `note` is never listed — it makes no platform call
 * (`botPlatformHelper.actionsOf` answers the full set).
 */
export interface BotPlatformDescriptor {
  platform: BotPlatformId
  /** The platform's name, as written beside its glyph (a proper name — not translated). */
  title: string
  glyph: BotPlatformGlyph
  credentials: BotCredentialField[]
  /** The receive modes the platform offers, preferred first. */
  receive: BotReceiveMode[]
  /** The platform calls the required credentials allow; `note` is never listed. */
  actions: BotActionKind[]
  /** `auto`: the server registers the hook itself; `manual`: a person pastes `setup` into the console. */
  setup: 'auto' | 'manual'
  /** Where a person learns to create the bot and its credentials. */
  docs: string
  /** What a person does in the platform itself so the bot can act (rights, intents, console steps), per language. */
  hint: BotTexts
  /** A link drawn in the connect form before saving (an invite), filled from the typed credentials. */
  link?: BotPlatformLink
}

/** A connection as any client sees it — never a credential. */
export interface BotConnection {
  id: string
  /** The organization (or application) key the connection belongs to — the server's, never the wire's. */
  scope: string
  platform: BotPlatformId
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
  platform: BotPlatformId
  label: string
  transport?: BotTransport
  enabled?: boolean
  credentials?: Record<string, string>
}

/** A chat; `space` is the server or workspace it belongs to, on a platform that has one. */
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
 * Enough to act on one message. `space` (the server or workspace) is carried so a reference alone
 * suffices where the platform addresses a member through it (a time-out that names the server).
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
  platform: BotPlatformId
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
  platform: BotPlatformId
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
