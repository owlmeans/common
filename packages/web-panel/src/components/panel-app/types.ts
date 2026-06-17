import type { AppProps } from '@owlmeans/client'

export interface PanelAppProps extends AppProps {
  /**
   * Optional CSS class added to the outermost wrapper. Use to scope
   * Tailwind theme overrides (e.g. `'dark'` or a custom theme class).
   * Replaces the legacy MUI `theme?: Theme` prop.
   */
  rootClassName?: string
}
