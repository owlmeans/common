/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `debug` | `info` | `warn` | `error` | `silent`. Default: `debug` under `vite`, `info` in a build. */
  readonly VITE_LOG_LEVEL?: string
  /** Scopes forced to debug whatever the level is, e.g. `session,i18n` or `*`. */
  readonly VITE_LOG_DEBUG?: string
}
