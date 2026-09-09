import type { ComponentType, ReactNode } from 'react'
import type { NavTranslate } from '@owlmeans/client-panel'
import type { StyledProps } from '../types.js'

/**
 * What a menu row IS, rather than what it looks like.
 *
 * The kinds are closed on purpose: every one of them has its own focus, keyboard and
 * close-on-select semantics, and a caller that could hand in arbitrary JSX at the top level
 * would silently lose all three. `Widget` is the escape hatch, and it is a ROW rather than an
 * item precisely so its own controls keep working — see `PanelMenuWidgetEntry`.
 */
export enum PanelMenuEntryKind {
  Item = 'item',
  Widget = 'widget',
  Label = 'label',
  Separator = 'separator',
  Sub = 'sub',
}

interface PanelMenuEntryBase {
  /** Stable React key, and the default translation-key stem (`menu.<key>`). */
  key: string
  /** Filtered out before rendering — including the separators it would orphan. */
  hidden?: boolean
}

/**
 * A normal, focusable row that closes the menu when chosen.
 *
 * Exactly one of `alias` (a frontend entrypoint) or `href` (anything else) addresses a target,
 * the same union {@link PanelNavLink} uses — an alias never carries a URL, because the router
 * resolves it and a path that changes shape stays correct everywhere it is rendered. Give
 * neither and the row is a pure action driven by `onSelect`.
 */
export interface PanelMenuItemEntry extends PanelMenuEntryBase {
  kind: PanelMenuEntryKind.Item
  alias?: string
  href?: string
  /** Open in a new tab (`target="_blank"` + `rel="noopener noreferrer"`). */
  open?: boolean
  /** Literal label. Absent, the label is resolved through `translate`. */
  label?: string
  /** Translation key. Defaults to `modules.<alias>` for an alias row, else `menu.<key>`. */
  labelKey?: string
  Icon?: ComponentType<{ className?: string }>
  /** Right-aligned adornment — the current value, a shortcut, an external-link glyph. */
  hint?: ReactNode
  onSelect?: () => void
  disabled?: boolean
  /** Marks the row as the one currently in effect (`aria-current`, muted background). */
  active?: boolean
  variant?: 'default' | 'destructive'
}

/**
 * An arbitrary widget, rendered as a plain ROW and never as a menu item.
 *
 * A widget carries its own interactive controls, and a `DropdownMenuItem` around them takes
 * both the focus and the activation: Radix's roving tabindex swallows the inner button's
 * keyboard access, and `onSelect` closes the menu on any click that lands on the row — so a
 * "Top up" button inside an item dismisses the menu before its own handler is observed. The
 * row therefore takes no roving focus of its own and does not close the menu; the widget's
 * buttons are the only click targets, and they stay tabbable.
 */
export interface PanelMenuWidgetEntry extends PanelMenuEntryBase {
  kind: PanelMenuEntryKind.Widget
  /** A node, or a component the menu instantiates with its row `className`. */
  render: ReactNode | ComponentType<{ className?: string }>
  label?: string
  labelKey?: string
  /** Put the caption beside the widget instead of above it. */
  inline?: boolean
  className?: string
}

/** A section heading. Not focusable, not selectable. */
export interface PanelMenuLabelEntry extends PanelMenuEntryBase {
  kind: PanelMenuEntryKind.Label
  label?: string
  labelKey?: string
}

/** A horizontal rule between blocks. Normalised away when it would lead, trail or double up. */
export interface PanelMenuSeparatorEntry extends PanelMenuEntryBase {
  kind: PanelMenuEntryKind.Separator
}

/**
 * A nested menu — one level deep.
 *
 * `entries` is the same union so a submenu can carry labels and separators, but a `Sub` inside
 * a `Sub` is rendered as nothing: a dropdown that nests further is a navigation tree, and this
 * primitive is not one.
 */
export interface PanelMenuSubEntry extends PanelMenuEntryBase {
  kind: PanelMenuEntryKind.Sub
  label?: string
  labelKey?: string
  Icon?: ComponentType<{ className?: string }>
  /** Right-aligned adornment on the trigger — typically the current value. */
  hint?: ReactNode
  entries: PanelMenuEntry[]
}

export type PanelMenuEntry =
  | PanelMenuItemEntry
  | PanelMenuWidgetEntry
  | PanelMenuLabelEntry
  | PanelMenuSeparatorEntry
  | PanelMenuSubEntry

export interface PanelMenuProps extends StyledProps {
  entries: PanelMenuEntry[]
  /**
   * See {@link NavTranslate}. It is a PROP and never an implicit context read: an app mounted
   * with `renderApp` from `@owlmeans/web-client` has no i18n provider, and the panel i18n hook
   * dereferences `i18n.options` on the empty object `react-i18next` returns without an
   * instance — a throw inside render that blanks the whole app. Omitted, literal labels win and
   * the fallback is a humanized key.
   */
  translate?: NavTranslate
  /** Replaces the default icon-button trigger entirely. */
  trigger?: ReactNode
  /** Accessible name for the default trigger. */
  triggerLabel?: string
  /**
   * Rendered on the trigger's top-right corner — a notification dot, a count. It is a slot
   * rather than a `tone` enum because what deserves attention is the application's judgement,
   * not the menu's.
   */
  indicator?: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Styles the default trigger. Merged over its defaults, never substituted. */
  triggerClassName?: string
  /** Styles the dropdown surface. Merged over its defaults, never substituted. */
  contentClassName?: string
  /** Controlled open state. Omitted, the menu owns it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Forwarded to the trigger as `data-testid`. */
  testId?: string
}
