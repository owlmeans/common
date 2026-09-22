import type { ColorSchemeChoice } from '../../scheme/scheme.js'
import type { StyledProps } from '../types.js'

export interface ColorSchemeModel {
  /** What the page is showing: the stored choice, or the operating system's preference. */
  scheme: 'light' | 'dark'
  /** The visitor's explicit choice, or `null` while the page follows the operating system. */
  choice: ColorSchemeChoice | null
  /** Choose — `null` clears the choice and hands the page back to the operating system. */
  setChoice: (choice: ColorSchemeChoice | null) => void
}

/** The toggle's accessible names — what pressing it DOES. English defaults when absent. */
export interface ThemeToggleLabels {
  /** Shown while the page is dark. Default "Switch to light mode". */
  toLight?: string
  /** Shown while the page is light. Default "Switch to dark mode". */
  toDark?: string
}

export interface ThemeToggleProps extends StyledProps {
  labels?: ThemeToggleLabels
}
